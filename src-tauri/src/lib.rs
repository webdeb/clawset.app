use serde_json::Value;
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::Emitter;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(serde::Serialize, Default)]
pub struct MultipassListInfo {
    name: String,
    ip: String,
    ubuntu_version: Option<String>,
    status: String,
}

#[derive(serde::Serialize, Default)]
pub struct MultipassInstanceDetails {
    host_path_folder: Option<String>,
    memory: Option<String>,
    cpus: Option<String>,
    storage: Option<String>,
    node_installed: Option<String>,
    openclaw_installed: Option<bool>,
    openclaw_running: Option<bool>,
    openclaw_token: Option<String>,
    is_provisioning: Option<bool>,
}

#[tauri::command]
async fn check_multipass() -> Result<bool, String> {
    match Command::new("multipass").arg("version").output() {
        Ok(output) => Ok(output.status.success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn list_multipass_instances() -> Result<Vec<MultipassListInfo>, String> {
    match Command::new("multipass").args(["list", "--format", "json"]).output() {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let mut results = Vec::new();
                if let Ok(json) = serde_json::from_str::<Value>(&stdout) {
                    if let Some(list) = json["list"].as_array() {
                        for vm in list {
                            let name = vm["name"].as_str().unwrap_or("").to_string();
                            let mut ip = String::new();
                            if let Some(ipv4) = vm["ipv4"].as_array() {
                                if !ipv4.is_empty() {
                                    ip = ipv4[0].as_str().unwrap_or("").to_string();
                                }
                            }
                            let ubuntu_version = vm["release"].as_str().map(|s| s.to_string());
                            let status = vm["state"].as_str().unwrap_or("Unknown").to_string();
                            results.push(MultipassListInfo {
                                name,
                                ip,
                                ubuntu_version,
                                status,
                            });
                        }
                    }
                }
                Ok(results)
            } else {
                Err(String::from_utf8_lossy(&output.stderr).to_string())
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn get_multipass_instance_details(instance_name: &str) -> Result<MultipassInstanceDetails, String> {
    let mut details = MultipassInstanceDetails::default();

    // 1. Get info
    match Command::new("multipass")
        .args(["info", instance_name, "--format", "json"])
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Ok(json) = serde_json::from_str::<Value>(&stdout) {
                    if let Some(info) = json["info"][instance_name].as_object() {
                        if let Some(mem) = info.get("memory") {
                            let total = mem["total"].as_u64().unwrap_or(0);
                            let used = mem["used"].as_u64().unwrap_or(0);
                            details.memory = Some(format!("{} MB / {} MB", used / 1024 / 1024, total / 1024 / 1024));
                        }
                        if let Some(cpus) = info.get("cpu_count").and_then(|c| c.as_str()) {
                            details.cpus = Some(cpus.to_string());
                        }
                        if let Some(disks) = info.get("disks").and_then(|d| d.as_object()) {
                            if let Some(sda1) = disks.get("sda1") {
                                let total = sda1["total"].as_str().unwrap_or("0").parse::<u64>().unwrap_or(0);
                                let used = sda1["used"].as_str().unwrap_or("0").parse::<u64>().unwrap_or(0);
                                details.storage = Some(format!("{} GB / {} GB", used / 1024 / 1024 / 1024, total / 1024 / 1024 / 1024));
                            }
                        }
                        if let Some(mounts) = info.get("mounts").and_then(|m| m.as_object()) {
                            if let Some(mount) = mounts.get("/home/ubuntu/clawset") {
                                details.host_path_folder = mount["source_path"].as_str().map(|s| s.to_string());
                            }
                        }
                    }
                }
            }
        }
        Err(_) => {}
    }

    // 2. Exec inner logic in one go
    let script = "
source ~/.bashrc
echo '===NODE==='
node -v || echo 'NOT_FOUND'
echo '===OPENCLAW_VER==='
openclaw --version || echo 'NOT_FOUND'
echo '===OPENCLAW_STATUS==='
openclaw status || echo 'NOT_FOUND'
echo '===OPENCLAW_JSON==='
CONFIG_PATH=\"${OPENCLAW_CONFIG_PATH:-/home/ubuntu/clawset/openclaw/config/openclaw.json}\"
cat \"$CONFIG_PATH\" || echo 'NOT_FOUND'
echo '===PROVISIONING==='
if [ -f /tmp/provisioning ]; then echo 'YES'; else echo 'NO'; fi
";
    match Command::new("multipass")
        .args(["exec", instance_name, "--", "bash", "-ic", script])
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                // Parse the output
                let mut section = "";
                let mut json_str = String::new();
                for line in stdout.lines() {
                    let trim = line.trim();
                    if trim == "===NODE===" { section = "node"; continue; }
                    if trim == "===OPENCLAW_VER===" { section = "openclaw_ver"; continue; }
                    if trim == "===OPENCLAW_STATUS===" { section = "openclaw_status"; continue; }
                    if trim == "===OPENCLAW_JSON===" { section = "openclaw_json"; continue; }
                    if trim == "===PROVISIONING===" { section = "provisioning"; continue; }
                    
                    match section {
                        "node" => {
                            if trim != "NOT_FOUND" && !trim.is_empty() {
                                details.node_installed = Some(trim.to_string());
                            }
                        }
                        "openclaw_ver" => {
                            if trim != "NOT_FOUND" && !trim.is_empty() {
                                details.openclaw_installed = Some(true);
                            }
                        }
                        "openclaw_status" => {
                            if trim.contains("Running") || trim.contains("started") || trim.contains("active") || trim.contains("Online") || trim.contains("PID") {
                                details.openclaw_running = Some(true);
                            }
                        }
                        "openclaw_json" => {
                            if trim != "NOT_FOUND" && !trim.is_empty() {
                                json_str.push_str(line);
                                json_str.push('\n');
                            }
                        }
                        "provisioning" => {
                            if trim == "YES" {
                                details.is_provisioning = Some(true);
                            } else if trim == "NO" {
                                details.is_provisioning = Some(false);
                            }
                        }
                        _ => {}
                    }
                }

                if !json_str.is_empty() {
                    if let Ok(js) = serde_json::from_str::<Value>(&json_str) {
                        if let Some(token) = js["gateway"]["auth"]["token"].as_str() {
                            details.openclaw_token = Some(token.to_string());
                        }
                    }
                }
            }
        }
        Err(_) => {}
    }

    Ok(details)
}

#[tauri::command]
async fn read_provision_log(instance_name: &str) -> Result<String, String> {
    let output = Command::new("multipass")
        .args(["exec", instance_name, "--", "cat", "/tmp/provision.log"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        // Log doesn't exist yet or other error, return empty string
        Ok(String::new())
    }
}

#[tauri::command]
async fn start_openclaw(instance_name: &str) -> Result<(), String> {
    let output = Command::new("multipass")
        .args(["start", instance_name])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn run_and_stream(app: &tauri::AppHandle, mut command: Command, error_prefix: &str) -> Result<(), String> {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|e| format!("{}: {}", error_prefix, e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let app_clone_out = app.clone();
    let out_thread = std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app_clone_out.emit("provision-log", l);
            }
        }
    });

    let app_clone_err = app.clone();
    let err_thread = std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app_clone_err.emit("provision-log", format!("ERROR: {}", l));
            }
        }
    });

    let status = child.wait().map_err(|e| format!("{}: {}", error_prefix, e))?;
    out_thread.join().unwrap();
    err_thread.join().unwrap();

    if !status.success() {
        return Err(format!("{} exited with status: {}", error_prefix, status));
    }

    Ok(())
}

#[tauri::command]
async fn install_openclaw(app: tauri::AppHandle, instance_name: &str, shared_folder: &str, memory: &str, cpus: &str, disk: &str) -> Result<(), String> {
    let _ = app.emit("provision-log", format!("Starting setup for {}", instance_name));

    // 1. Copy default configurations into the shared folder before mounting
    // We assume the user runs the app from its root directory in dev, or it's bundled.
    // For simplicity, we execute a shell command to copy the default config.
    // Replace with standard robust copy logic using std::fs if this needs to be production ready.
    let _ = app.emit("provision-log", "Copying default configurations...".to_string());
    let mut cp_cmd = Command::new("cp");
    cp_cmd.args(["-rv", "setup-instance/default-config/clawset/.", shared_folder]);
    let _ = run_and_stream(&app, cp_cmd, "Failed to copy config");

    // 2. Launch an Ubuntu LTS instance with the designated parameters
    let _ = app.emit("provision-log", "Launching Ubuntu LTS instance (this may take a while)...".to_string());
    let mut launch = Command::new("multipass");
    launch.args([
        "launch",
        "-v",
        "lts",
        "--name",
        instance_name,
        "--cpus",
        cpus,
        "--memory",
        memory,
        "--disk",
        disk,
    ]);
    run_and_stream(&app, launch, "Failed to launch instance")?;

    // 3. Mount the shared folder into the VM at /home/ubuntu/clawset
    let _ = app.emit("provision-log", format!("Mounting shared folder to {}:/home/ubuntu/clawset...", instance_name));
    let mut mount = Command::new("multipass");
    mount.args([
        "mount",
        shared_folder,
        &format!("{}:/home/ubuntu/clawset", instance_name),
    ]);
    if let Err(e) = run_and_stream(&app, mount, "Failed to mount shared folder") {
         let _ = app.emit("provision-log", format!("Mount warning: {}", e));
    }

    // 4. Transfer provisioning scripts to the VM
    let _ = app.emit("provision-log", "Transferring provisioning scripts...".to_string());
    let mut transfer1 = Command::new("multipass");
    transfer1.args([
        "transfer",
        "setup-instance/node-provision.sh",
        &format!("{}:node-provision.sh", instance_name),
    ]);
    run_and_stream(&app, transfer1, "Failed to transfer node-provision.sh")?;

    let mut transfer2 = Command::new("multipass");
    transfer2.args([
        "transfer",
        "setup-instance/provision-openclaw-gateway.sh",
        &format!("{}:provision-openclaw-gateway.sh", instance_name),
    ]);
    run_and_stream(&app, transfer2, "Failed to transfer provision-openclaw-gateway.sh")?;

    // 5. Execute provisioning scripts inside the VM asynchronously
    let _ = app.emit("provision-log", "Starting background provisioning of Node and OpenClaw within the VM...".to_string());
    
    // We run the scripts via nohup in the background so multipass exec returns immediately.
    // We touch /tmp/provisioning as a lock file, run both scripts, and rm it when done.
    // All output is redirected to /tmp/provision.log
    let async_script = r#"
        nohup bash -c '
            touch /tmp/provisioning
            echo "==> Starting Provisioning" > /tmp/provision.log
            bash node-provision.sh >> /tmp/provision.log 2>&1
            bash provision-openclaw-gateway.sh >> /tmp/provision.log 2>&1
            echo "==> Provisioning Complete" >> /tmp/provision.log
            rm -f /tmp/provisioning
        ' >/dev/null 2>&1 &
    "#;

    let mut provision = Command::new("multipass");
    provision.args([
        "exec",
        instance_name,
        "--",
        "bash",
        "-c",
        async_script,
    ]);
    run_and_stream(&app, provision, "Failed to start background provisioning")?;

    let _ = app.emit("provision-log", "Installation kicked off! You can monitor progress in the environment view.".to_string());
    Ok(())
}

#[tauri::command]
fn set_webview_url(app: tauri::AppHandle, label: &str, url: &str) -> Result<(), String> {
    use tauri::Manager;
    if let Some(webview) = app.get_webview(label) {
        webview.eval(&format!("window.location.replace('{}');", url)).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Webview {} not found", label))
    }
}

#[tauri::command]
async fn setup_existing_instance(app: tauri::AppHandle, instance_name: &str, shared_folder: &str) -> Result<(), String> {
    let _ = app.emit("provision-log", format!("Starting existing instance setup for {}", instance_name));
    
    // 1. Copy default configurations into the shared folder before mounting
    let _ = app.emit("provision-log", "Copying default configurations...".to_string());
    let mut cp_cmd = Command::new("cp");
    cp_cmd.args(["-rv", "setup-instance/default-config/clawset/.", shared_folder]);
    let _ = run_and_stream(&app, cp_cmd, "Failed to copy config");

    // 2. Mount the shared folder if it's not already mounted (or at least try)
    // We ignore errors here because it might already be mounted
    let _ = app.emit("provision-log", format!("Mounting shared folder to {}:/home/ubuntu/clawset...", instance_name));
    let mut mount = Command::new("multipass");
    mount.args([
        "mount",
        shared_folder,
        &format!("{}:/home/ubuntu/clawset", instance_name),
    ]);

    if let Err(e) = run_and_stream(&app, mount, "Failed to mount shared folder") {
         let _ = app.emit("provision-log", format!("Mount warning: {}", e));
    }

    // 3. Transfer provisioning scripts to the VM
    let _ = app.emit("provision-log", "Transferring provisioning scripts...".to_string());
    let mut transfer1 = Command::new("multipass");
    transfer1.args([
        "transfer",
        "setup-instance/node-provision.sh",
        &format!("{}:node-provision.sh", instance_name),
    ]);
    run_and_stream(&app, transfer1, "Failed to transfer node-provision.sh")?;

    let mut transfer2 = Command::new("multipass");
    transfer2.args([
        "transfer",
        "setup-instance/provision-openclaw-gateway.sh",
        &format!("{}:provision-openclaw-gateway.sh", instance_name),
    ]);
    run_and_stream(&app, transfer2, "Failed to transfer provision-openclaw-gateway.sh")?;

    // 4. Execute provisioning scripts inside the VM asynchronously
    let _ = app.emit("provision-log", "Starting background provisioning of Node and OpenClaw within the VM...".to_string());
    
    let async_script = r#"
        nohup bash -c '
            touch /tmp/provisioning
            echo "==> Starting Provisioning" > /tmp/provision.log
            bash node-provision.sh >> /tmp/provision.log 2>&1
            bash provision-openclaw-gateway.sh >> /tmp/provision.log 2>&1
            echo "==> Provisioning Complete" >> /tmp/provision.log
            rm -f /tmp/provisioning
        ' >/dev/null 2>&1 &
    "#;

    let mut provision = Command::new("multipass");
    provision.args([
        "exec",
        instance_name,
        "--",
        "bash",
        "-c",
        async_script,
    ]);
    run_and_stream(&app, provision, "Failed to start background provisioning")?;

    let _ = app.emit("provision-log", "Installation kicked off! You can monitor progress in the environment view.".to_string());
    Ok(())
}

// sysinfo imports
use sysinfo::{System, Disks};

#[derive(serde::Serialize)]
struct HostResources {
    free_memory: u64,
    total_memory: u64,
    total_cpus: usize,
    available_disk: u64,
    total_disk: u64,
}

#[tauri::command]
fn get_host_resources() -> HostResources {
    let mut sys = System::new_all();
    sys.refresh_all();
    
    // Convert to GB for frontend convenience
    let free_memory = sys.free_memory();
    let total_memory = sys.total_memory();
    let total_cpus = sys.cpus().len();
    
    // For disk space, wait for disks info
    let disks = Disks::new_with_refreshed_list();
    let available_disk = disks.list().iter().map(|d| d.available_space()).sum();
    let total_disk = disks.list().iter().map(|d| d.total_space()).sum();

    HostResources {
        free_memory,
        total_memory,
        total_cpus,
        available_disk,
        total_disk,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            check_multipass,
            list_multipass_instances,
            get_multipass_instance_details,
            start_openclaw,
            install_openclaw,
            setup_existing_instance,
            set_webview_url,
            get_host_resources,
            read_provision_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

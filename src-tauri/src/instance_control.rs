use serde_json::Value;
use std::process::Command;

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
    is_provisioning: Option<bool>,
}

#[tauri::command]
pub async fn check_multipass() -> Result<bool, String> {
    match Command::new("multipass").arg("version").output() {
        Ok(output) => Ok(output.status.success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn list_multipass_instances() -> Result<Vec<MultipassListInfo>, String> {
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
pub async fn get_multipass_instance_details(instance_name: &str) -> Result<MultipassInstanceDetails, String> {
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

    // 2. Exec inner logic in one go (fast check only)
    let script = "
source ~/.bashrc
echo '===NODE==='
node -v || echo 'NOT_FOUND'
echo '===OPENCLAW_VER==='
openclaw --version || echo 'NOT_FOUND'
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
                let mut section = "";
                for line in stdout.lines() {
                    let trim = line.trim();
                    if trim == "===NODE===" { section = "node"; continue; }
                    if trim == "===OPENCLAW_VER===" { section = "openclaw_ver"; continue; }
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
            }
        }
        Err(_) => {}
    }

    Ok(details)
}

#[tauri::command]
pub async fn read_provision_log(instance_name: &str) -> Result<String, String> {
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
pub async fn start_openclaw(instance_name: &str) -> Result<(), String> {
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

#[tauri::command]
pub async fn sync_openclaw_status(instance_name: &str) -> Result<String, String> {
    let mut status_val = serde_json::json!({});
    let mut config_val = serde_json::json!({});

    // 1. Fetch OpenClaw Status
    let status_script = "source ~/.bashrc && openclaw status --all --json";
    if let Ok(output) = Command::new("multipass")
        .args(["exec", instance_name, "--", "bash", "-ic", status_script])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(js) = serde_json::from_str::<Value>(&stdout) {
                status_val = js;
            }
        }
    }

    // 2. Fetch OpenClaw Config
    let config_path = "/home/ubuntu/clawset/.openclaw/openclaw.json";
    if let Ok(output) = Command::new("multipass")
        .args(["exec", instance_name, "--", "cat", config_path])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(js) = serde_json::from_str::<Value>(&stdout) {
                config_val = js;
            }
        }
    }

    // Combine into a clean JSON response
    let response = serde_json::json!({
        "status": status_val,
        "config": config_val
    });

    Ok(serde_json::to_string(&response).unwrap_or_else(|_| "{\"status\":{},\"config\":{}}".to_string()))
}

#[tauri::command]
pub async fn write_openclaw_config(instance_name: &str, config_json: &str) -> Result<(), String> {
    let config_path = "/home/ubuntu/clawset/.openclaw/openclaw.json";
    let write_cmd = format!("mkdir -p /home/ubuntu/clawset/.openclaw && cat << 'EOF' > {}\n{}\nEOF", config_path, config_json);

    let output = Command::new("multipass")
        .args(["exec", instance_name, "--", "bash", "-c", &write_cmd])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn start_openclaw_daemon(instance_name: &str) -> Result<(), String> {
    let script = "source ~/.bashrc && openclaw gateway start"; // or openclaw daemon start depending on CLI
    let output = Command::new("multipass")
        .args(["exec", instance_name, "--", "bash", "-ic", script])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn stop_openclaw_daemon(instance_name: &str) -> Result<(), String> {
    let script = "source ~/.bashrc && openclaw gateway stop"; // or openclaw daemon stop
    let output = Command::new("multipass")
        .args(["exec", instance_name, "--", "bash", "-ic", script])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn read_agent_auth(instance_name: &str) -> Result<String, String> {
    let path = "/home/ubuntu/clawset/.openclaw/agents/main/agent/auth-profiles.json";
    let output = Command::new("multipass")
        .args(["exec", instance_name, "--", "cat", path])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Ok("{}".to_string()) // If file missing, treat as empty object
    }
}

#[tauri::command]
pub async fn write_agent_auth(instance_name: &str, auth_json: &str) -> Result<(), String> {
    let path = "/home/ubuntu/clawset/.openclaw/agents/main/agent/auth-profiles.json";
    let write_cmd = format!("mkdir -p /home/ubuntu/clawset/.openclaw/agents/main/agent && cat << 'EOF' > {}\n{}\nEOF", path, auth_json);

    let output = Command::new("multipass")
        .args(["exec", instance_name, "--", "bash", "-c", &write_cmd])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn check_apphub_status(instance_name: &str) -> Result<bool, String> {
    // curl the port to see if a web server is responding
    let script = "curl -s http://127.0.0.1:3000 > /dev/null";
    let output = Command::new("multipass")
        .args(["exec", instance_name, "--", "bash", "-c", script])
        .output()
        .map_err(|e| e.to_string())?;

    // If curl exits successfully, the server is running and accepting connections
    Ok(output.status.success())
}

#[tauri::command]
pub async fn start_apphub(instance_name: &str) -> Result<(), String> {
    // We launch npm run dev in the background under ~/clawset/apphub
    let script = "source ~/.bashrc && cd ~/clawset/apphub && nohup npm run dev > apphub.log 2>&1 &";
    
    let output = Command::new("multipass")
        .args(["exec", instance_name, "--", "bash", "-ic", script])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

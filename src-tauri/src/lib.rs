use serde_json::Value;
use std::process::Command;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn check_multipass() -> Result<bool, String> {
    match Command::new("multipass").arg("version").output() {
        Ok(output) => Ok(output.status.success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn list_multipass_instances() -> Result<Vec<String>, String> {
    match Command::new("multipass").args(["list", "--format", "json"]).output() {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Ok(json) = serde_json::from_str::<Value>(&stdout) {
                    if let Some(list) = json["list"].as_array() {
                        let names: Vec<String> = list
                            .iter()
                            .filter_map(|vm| vm["name"].as_str().map(|s| s.to_string()))
                            .collect();
                        return Ok(names);
                    }
                }
                Ok(vec![])
            } else {
                Err(String::from_utf8_lossy(&output.stderr).to_string())
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn get_openclaw_status(instance_name: &str) -> Result<String, String> {
    match Command::new("multipass")
        .args(["info", instance_name, "--format", "json"])
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Ok(json) = serde_json::from_str::<Value>(&stdout) {
                    if let Some(state) = json["info"][instance_name]["state"].as_str() {
                        return Ok(state.to_string());
                    }
                }
                Ok("Unknown".to_string())
            } else {
                Ok("NotInstalled".to_string())
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn get_instance_ip(instance_name: &str) -> Result<String, String> {
    match Command::new("multipass")
        .args(["info", instance_name, "--format", "json"])
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Ok(json) = serde_json::from_str::<Value>(&stdout) {
                    if let Some(ipv4) = json["info"][instance_name]["ipv4"].as_array() {
                        if !ipv4.is_empty() {
                            if let Some(ip) = ipv4[0].as_str() {
                                return Ok(ip.to_string());
                            }
                        }
                    }
                }
                Err("IP not found".to_string())
            } else {
                Err("Instance not found or not running".to_string())
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn get_openclaw_token(instance_name: &str) -> Result<String, String> {
    match Command::new("multipass")
        .args(["exec", instance_name, "--", "cat", "/home/ubuntu/clawset/openclaw-config/openclaw.json"])
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Ok(json) = serde_json::from_str::<Value>(&stdout) {
                    if let Some(token) = json["gateway"]["auth"]["token"].as_str() {
                        return Ok(token.to_string());
                    }
                }
                Err("Token not found in configuration".to_string())
            } else {
                Err("Configuration file not found or instance not running".to_string())
            }
        }
        Err(e) => Err(e.to_string()),
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

#[tauri::command]
async fn install_openclaw(instance_name: &str, shared_folder: &str) -> Result<(), String> {
    // 1. Copy default configurations into the shared folder before mounting
    // We assume the user runs the app from its root directory in dev, or it's bundled.
    // For simplicity, we execute a shell command to copy the default config.
    // Replace with standard robust copy logic using std::fs if this needs to be production ready.
    let _ = Command::new("cp")
        .args(["-r", "setup-instance/default-config/clawset/.", shared_folder])
        .output();

    // 2. Launch an Ubuntu LTS instance with the designated name, 2G RAM and 10G Disk
    let launch = Command::new("multipass")
        .args([
            "launch",
            "lts",
            "--name",
            instance_name,
            "--memory",
            "2G",
            "--disk",
            "10G",
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !launch.status.success() {
        return Err(format!(
            "Failed to launch instance: {}",
            String::from_utf8_lossy(&launch.stderr)
        ));
    }

    // 3. Mount the shared folder into the VM at /home/ubuntu/clawset
    let mount = Command::new("multipass")
        .args([
            "mount",
            shared_folder,
            &format!("{}:/home/ubuntu/clawset", instance_name),
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !mount.status.success() {
        return Err(format!(
            "Failed to mount shared folder: {}",
            String::from_utf8_lossy(&mount.stderr)
        ));
    }

    // 4. Transfer provisioning scripts to the VM
    Command::new("multipass")
        .args([
            "transfer",
            "setup-instance/node-provision.sh",
            &format!("{}:node-provision.sh", instance_name),
        ])
        .output()
        .map_err(|e| e.to_string())?;

    Command::new("multipass")
        .args([
            "transfer",
            "setup-instance/provision-openclaw-gateway.sh",
            &format!("{}:provision-openclaw-gateway.sh", instance_name),
        ])
        .output()
        .map_err(|e| e.to_string())?;

    // 5. Execute provisioning scripts inside the VM
    let provision = Command::new("multipass")
        .args([
            "exec",
            instance_name,
            "--",
            "bash",
            "node-provision.sh",
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !provision.status.success() {
        return Err(format!(
            "Failed to run node provisioning: {}",
            String::from_utf8_lossy(&provision.stderr)
        ));
    }

    let setup = Command::new("multipass")
        .args([
            "exec",
            instance_name,
            "--",
            "bash",
            "provision-openclaw-gateway.sh",
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !setup.status.success() {
        return Err(format!(
            "Failed to run openclaw setup: {}",
            String::from_utf8_lossy(&setup.stderr)
        ));
    }

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            check_multipass,
            list_multipass_instances,
            get_openclaw_status,
            get_instance_ip,
            get_openclaw_token,
            start_openclaw,
            install_openclaw,
            set_webview_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

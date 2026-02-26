pub mod instance_control;
pub mod instance_provision;

// sysinfo imports
use sysinfo::{Disks, System};


#[tauri::command]
fn set_webview_url(app: tauri::AppHandle, label: &str, url: &str) -> Result<(), String> {
    use tauri::Manager;
    if let Some(webview) = app.get_webview(label) {
        webview
            .eval(&format!("window.location.replace('{}');", url))
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Webview {} not found", label))
    }
}

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
            instance_control::check_multipass,
            instance_control::list_multipass_instances,
            instance_control::get_multipass_instance_details,
            instance_control::start_openclaw,
            instance_control::sync_openclaw_status,
            instance_control::start_openclaw_daemon,
            instance_control::stop_openclaw_daemon,
            instance_provision::install_openclaw,
            instance_provision::provision_instance,
            set_webview_url,
            get_host_resources,
            instance_control::read_provision_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

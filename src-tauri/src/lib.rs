mod multipass;
pub mod instance_control;
pub mod instance_provision;
pub mod traits;
pub mod plugin_manager;
pub mod js_runtime;
pub mod script_runner;
pub mod commands;

// sysinfo imports
use sysinfo::{Disks, System};

use std::path::PathBuf;
use commands::PluginState;
use plugin_manager::PluginManager;

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

    let free_memory = sys.free_memory();
    let total_memory = sys.total_memory();
    let total_cpus = sys.cpus().len();

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

/// Get the plugins directory — defaults to ~/.clawset/plugins/
/// but also checks for a local `plugins/` dir in the app's resource path
fn get_plugins_dir() -> PathBuf {
    // For monorepo development: check if plugins/ exists next to the binary
    // In production, use ~/.clawset/plugins/
    let home = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    let clawset_dir = home.join(".clawset").join("plugins");
    let _ = std::fs::create_dir_all(&clawset_dir);
    clawset_dir
}

fn dirs_next() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let plugin_dir = get_plugins_dir();
    let plugin_state = PluginState {
        manager: std::sync::Mutex::new(PluginManager::new(plugin_dir)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(plugin_state)
        .invoke_handler(tauri::generate_handler![
            // Legacy commands (kept for backward compatibility during migration)
            instance_control::check_multipass,
            instance_control::list_multipass_instances,
            instance_control::get_multipass_instance_details,
            instance_control::start_openclaw,
            instance_control::sync_openclaw_status,
            instance_control::write_openclaw_config,
            instance_control::start_openclaw_daemon,
            instance_control::stop_openclaw_daemon,
            instance_control::read_agent_auth,
            instance_control::write_agent_auth,
            instance_control::check_apphub_status,
            instance_control::start_apphub,
            instance_provision::install_openclaw,
            instance_provision::provision_instance,
            instance_control::read_provision_log,
            // Shared commands
            set_webview_url,
            get_host_resources,
            // New plugin system commands
            commands::plugin_list,
            commands::plugin_add,
            commands::plugin_remove,
            commands::plugin_update,
            commands::instance_list,
            commands::instance_get,
            commands::instance_create,
            commands::instance_destroy,
            commands::instance_start,
            commands::instance_stop,
            commands::instance_exec,
            commands::app_install,
            commands::app_action,
            commands::app_read_file,
            commands::app_write_file,
            commands::auth_save,
            commands::auth_list_providers,
            commands::plugin_get_manifest,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

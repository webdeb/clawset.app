use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

use crate::plugin_manager::PluginManager;
use crate::script_runner::ScriptRunner;

/// Shared state for the plugin system
pub struct PluginState {
    pub manager: Mutex<PluginManager>,
}

// ─── Plugin Management ─────────────────────────────────────

#[tauri::command]
pub async fn plugin_list(state: State<'_, PluginState>) -> Result<serde_json::Value, String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    let plugins = pm.discover();
    let result: Vec<serde_json::Value> = plugins.iter().map(|(path, m)| {
        serde_json::json!({
            "id": m.id,
            "name": m.name,
            "type": m.plugin_type,
            "version": m.version,
            "description": m.description,
            "path": path.to_string_lossy()
        })
    }).collect();
    Ok(serde_json::json!(result))
}

#[tauri::command]
pub async fn plugin_add(state: State<'_, PluginState>, git_url: &str) -> Result<serde_json::Value, String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    let manifest = pm.install_from_git(git_url).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "id": manifest.id,
        "name": manifest.name,
        "type": manifest.plugin_type,
        "version": manifest.version,
    }))
}

#[tauri::command]
pub async fn plugin_remove(state: State<'_, PluginState>, id: &str) -> Result<(), String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    pm.remove_plugin(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn plugin_update(state: State<'_, PluginState>, id: &str) -> Result<(), String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    pm.update_plugin(id).map_err(|e| e.to_string())
}

// ─── Instance Provider Commands ─────────────────────────────

#[tauri::command]
pub async fn instance_list(
    app: tauri::AppHandle,
    state: State<'_, PluginState>,
    provider_id: &str,
) -> Result<serde_json::Value, String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    let (path, manifest) = pm.get_plugin(provider_id)
        .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;

    let env = HashMap::new();
    ScriptRunner::run_provider_script(&pm, &path, &manifest, "list", &env, Some(&app), None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn instance_get(
    app: tauri::AppHandle,
    state: State<'_, PluginState>,
    provider_id: &str,
    instance_id: &str,
) -> Result<serde_json::Value, String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    let (path, manifest) = pm.get_plugin(provider_id)
        .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;

    let mut env = HashMap::new();
    env.insert("INSTANCE_ID".to_string(), instance_id.to_string());

    ScriptRunner::run_provider_script(&pm, &path, &manifest, "get", &env, Some(&app), None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn instance_create(
    app: tauri::AppHandle,
    state: State<'_, PluginState>,
    provider_id: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    let (path, manifest) = pm.get_plugin(provider_id)
        .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;

    // Map JSON params to env vars
    let mut env = HashMap::new();
    if let Some(obj) = params.as_object() {
        for (key, val) in obj {
            env.insert(key.to_uppercase(), val.as_str().unwrap_or(&val.to_string()).to_string());
        }
    }

    ScriptRunner::run_provider_script(
        &pm, &path, &manifest, "create", &env, Some(&app), Some("provision-log"),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn instance_destroy(
    app: tauri::AppHandle,
    state: State<'_, PluginState>,
    provider_id: &str,
    instance_id: &str,
) -> Result<serde_json::Value, String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    let (path, manifest) = pm.get_plugin(provider_id)
        .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;

    let mut env = HashMap::new();
    env.insert("INSTANCE_ID".to_string(), instance_id.to_string());

    ScriptRunner::run_provider_script(&pm, &path, &manifest, "destroy", &env, Some(&app), None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn instance_start(
    app: tauri::AppHandle,
    state: State<'_, PluginState>,
    provider_id: &str,
    instance_id: &str,
) -> Result<serde_json::Value, String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    let (path, manifest) = pm.get_plugin(provider_id)
        .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;

    let mut env = HashMap::new();
    env.insert("INSTANCE_ID".to_string(), instance_id.to_string());

    ScriptRunner::run_provider_script(&pm, &path, &manifest, "start", &env, Some(&app), None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn instance_stop(
    app: tauri::AppHandle,
    state: State<'_, PluginState>,
    provider_id: &str,
    instance_id: &str,
) -> Result<serde_json::Value, String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    let (path, manifest) = pm.get_plugin(provider_id)
        .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;

    let mut env = HashMap::new();
    env.insert("INSTANCE_ID".to_string(), instance_id.to_string());

    ScriptRunner::run_provider_script(&pm, &path, &manifest, "stop", &env, Some(&app), None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn instance_exec(
    app: tauri::AppHandle,
    state: State<'_, PluginState>,
    provider_id: &str,
    instance_id: &str,
    cmd: &str,
) -> Result<serde_json::Value, String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    let (path, manifest) = pm.get_plugin(provider_id)
        .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;

    let mut env = HashMap::new();
    env.insert("INSTANCE_ID".to_string(), instance_id.to_string());
    env.insert("CMD".to_string(), cmd.to_string());

    ScriptRunner::run_provider_script(&pm, &path, &manifest, "exec", &env, Some(&app), None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn instance_poll(
    app: tauri::AppHandle,
    state: State<'_, PluginState>,
    provider_id: &str,
    instance_id: &str,
    app_id: &str,
) -> Result<serde_json::Value, String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    
    let (provider_path, provider_manifest) = pm.get_plugin(provider_id)
        .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;

    let (app_path, app_manifest) = pm.get_plugin(app_id)
        .ok_or_else(|| format!("Agent app '{}' not found", app_id))?;

    // 1. Get instance details (instance_get)
    let mut get_env = HashMap::new();
    get_env.insert("INSTANCE_ID".to_string(), instance_id.to_string());
    
    let details = ScriptRunner::run_provider_script(
        &pm, &provider_path, &provider_manifest, "get", &get_env, Some(&app), None
    ).unwrap_or_else(|_| serde_json::json!({ "status": "Unknown" }));

    // If it's not running, we skip app status and views
    let is_running = details.get("status").and_then(|s| s.as_str()) == Some("Running");
    
    let mut app_status = serde_json::json!({});
    let mut views_output = serde_json::json!({});

    if is_running {
        // 2. Get app status (app_action "status")
        app_status = ScriptRunner::run_agent_script(
            &pm, &provider_path, &provider_manifest,
            instance_id,
            &app_path, &app_manifest,
            "status",
            Some(&app), None,
        ).unwrap_or_else(|_| serde_json::json!({}));

        // 3. Get views (instance_exec "cat .clawset/views.json")
        let mut exec_env = HashMap::new();
        exec_env.insert("INSTANCE_ID".to_string(), instance_id.to_string());
        exec_env.insert("CMD".to_string(), "cat ~/.clawset/views.json 2>/dev/null || echo '{\"views\":[]}'".to_string());
        
        views_output = ScriptRunner::run_provider_script(
            &pm, &provider_path, &provider_manifest, "exec", &exec_env, Some(&app), None
        ).unwrap_or_else(|_| serde_json::json!({ "stdout": "{\"views\":[]}" }));
    }

    Ok(serde_json::json!({
        "details": details,
        "app_status": app_status,
        "views_output": views_output,
    }))
}

// ─── Agent App Commands ─────────────────────────────────────

#[tauri::command]
pub async fn app_install(
    app: tauri::AppHandle,
    state: State<'_, PluginState>,
    provider_id: &str,
    instance_id: &str,
    app_id: &str,
) -> Result<serde_json::Value, String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    let (provider_path, provider_manifest) = pm.get_plugin(provider_id)
        .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;
    let (app_path, app_manifest) = pm.get_plugin(app_id)
        .ok_or_else(|| format!("Agent app '{}' not found", app_id))?;

    ScriptRunner::run_agent_script(
        &pm, &provider_path, &provider_manifest,
        instance_id,
        &app_path, &app_manifest,
        "install",
        Some(&app), Some("provision-log"),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn app_action(
    app: tauri::AppHandle,
    state: State<'_, PluginState>,
    provider_id: &str,
    instance_id: &str,
    app_id: &str,
    action: &str,
) -> Result<serde_json::Value, String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    let (provider_path, provider_manifest) = pm.get_plugin(provider_id)
        .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;
    let (app_path, app_manifest) = pm.get_plugin(app_id)
        .ok_or_else(|| format!("Agent app '{}' not found", app_id))?;

    ScriptRunner::run_agent_script(
        &pm, &provider_path, &provider_manifest,
        instance_id,
        &app_path, &app_manifest,
        action,
        Some(&app), None,
    ).map_err(|e| e.to_string())
}

/// Read a config or auth file from an instance
#[tauri::command]
pub async fn app_read_file(
    app: tauri::AppHandle,
    state: State<'_, PluginState>,
    provider_id: &str,
    instance_id: &str,
    remote_path: &str,
) -> Result<serde_json::Value, String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    let (path, manifest) = pm.get_plugin(provider_id)
        .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;

    ScriptRunner::read_instance_file(&pm, &path, &manifest, instance_id, remote_path, Some(&app))
        .map_err(|e| e.to_string())
}

/// Write a config or auth file to an instance
#[tauri::command]
pub async fn app_write_file(
    app: tauri::AppHandle,
    state: State<'_, PluginState>,
    provider_id: &str,
    instance_id: &str,
    remote_path: &str,
    content: &str,
) -> Result<serde_json::Value, String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    let (path, manifest) = pm.get_plugin(provider_id)
        .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;

    ScriptRunner::write_instance_file(&pm, &path, &manifest, instance_id, remote_path, content, Some(&app))
        .map_err(|e| e.to_string())
}

// ─── Auth Management ────────────────────────────────────────

/// Save auth credentials for an AI provider to ~/.clawset/auth/{provider_id}.json
#[tauri::command]
pub async fn auth_save(provider_id: &str, auth_json: &str) -> Result<(), String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Cannot determine home directory".to_string())?;

    let auth_dir = std::path::PathBuf::from(&home).join(".clawset").join("auth");
    std::fs::create_dir_all(&auth_dir).map_err(|e| e.to_string())?;

    let auth_file = auth_dir.join(format!("{}.json", provider_id));
    std::fs::write(&auth_file, auth_json).map_err(|e| e.to_string())?;

    Ok(())
}

/// List which AI providers have stored credentials
#[tauri::command]
pub async fn auth_list_providers() -> Result<serde_json::Value, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Cannot determine home directory".to_string())?;

    let auth_dir = std::path::PathBuf::from(&home).join(".clawset").join("auth");

    let mut result = HashMap::new();

    if auth_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&auth_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("json") {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        result.insert(stem.to_string(), serde_json::json!(true));
                    }
                }
            }
        }
    }

    Ok(serde_json::json!(result))
}

// ─── Plugin Manifest Query ──────────────────────────────────

/// Get a plugin's parsed manifest as JSON (for frontend views/auth config)
#[tauri::command]
pub async fn plugin_get_manifest(
    state: State<'_, PluginState>,
    id: &str,
) -> Result<serde_json::Value, String> {
    let pm = state.manager.lock().map_err(|e| e.to_string())?;
    let (path, _manifest) = pm.get_plugin(id)
        .ok_or_else(|| format!("Plugin '{}' not found", id))?;

    let manifest_path = path.join("manifest.yaml");
    let content = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Cannot read manifest: {}", e))?;

    let value: serde_json::Value = serde_yaml::from_str(&content)
        .map_err(|e| format!("Cannot parse manifest: {}", e))?;

    Ok(value)
}

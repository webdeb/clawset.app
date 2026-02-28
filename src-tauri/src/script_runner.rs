use std::collections::HashMap;
use std::path::Path;

use crate::traits::{PluginManifest, PluginError};
use crate::js_runtime::JsRuntime;
use crate::plugin_manager::PluginManager;

/// Executes plugin scripts: JS for host-side (instance providers), bash for instance-side (agent apps).
pub struct ScriptRunner;

impl ScriptRunner {
    /// Run a host-side JS script (instance provider or AI provider).
    /// Returns the JSON result from the script.
    pub fn run_provider_script(
        pm: &PluginManager,
        plugin_path: &Path,
        manifest: &PluginManifest,
        action: &str,
        env: &HashMap<String, String>,
        app: Option<&tauri::AppHandle>,
        log_event: Option<&str>,
    ) -> Result<serde_json::Value, PluginError> {
        let script_ref = manifest.scripts.get(action)
            .ok_or_else(|| PluginError::ScriptNotFound(
                format!("No script '{}' defined in plugin '{}'", action, manifest.id)
            ))?;

        let script_path = pm.resolve_script_path(plugin_path, script_ref);
        if !script_path.exists() {
            return Err(PluginError::ScriptNotFound(
                format!("{:?}", script_path)
            ));
        }

        JsRuntime::run_script(&script_path, env, app, log_event)
    }

    /// Run an agent app script inside an instance.
    /// This uses the instance provider's exec command to run bash inside the VM/container.
    pub fn run_agent_script(
        pm: &PluginManager,
        provider_path: &Path,
        provider_manifest: &PluginManifest,
        instance_id: &str,
        app_path: &Path,
        app_manifest: &PluginManifest,
        action: &str,
        app: Option<&tauri::AppHandle>,
        log_event: Option<&str>,
    ) -> Result<serde_json::Value, PluginError> {
        // 1. Get the script command for this action from the agent app manifest
        let script_ref = app_manifest.scripts.get(action)
            .ok_or_else(|| PluginError::ScriptNotFound(
                format!("No script '{}' defined in agent app '{}'", action, app_manifest.id)
            ))?;

        // 2. Build the exec env vars
        let mut env = HashMap::new();
        env.insert("INSTANCE_ID".to_string(), instance_id.to_string());
        // The CMD env var contains: "bash -c 'script_content_or_ref'"
        // But first we need to handle this properly. The script_ref could be:
        // - "scripts/install-ubuntu.sh" → need to transfer then exec
        // - "scripts/control.sh start" → need to transfer then exec with args

        // Split script_ref into script path and args
        let parts: Vec<&str> = script_ref.splitn(2, ' ').collect();
        let script_file = parts[0];
        let script_args = parts.get(1).unwrap_or(&"");

        let script_local_path = app_path.join(script_file);

        // 3. Transfer the script to the instance using the provider's transfer command
        let remote_script_path = format!("/tmp/clawset-{}-{}", app_manifest.id, script_file.replace('/', "-"));
        let mut transfer_env = HashMap::new();
        transfer_env.insert("INSTANCE_ID".to_string(), instance_id.to_string());
        transfer_env.insert("LOCAL_PATH".to_string(), script_local_path.to_string_lossy().to_string());
        transfer_env.insert("REMOTE_PATH".to_string(), remote_script_path.clone());

        // Run the provider's transfer script
        if provider_manifest.scripts.contains_key("transfer") {
            Self::run_provider_script(pm, provider_path, provider_manifest, "transfer", &transfer_env, app, None)?;
        }

        // 4. Execute the script inside the instance via the provider's exec
        let bash_cmd = format!("bash {} {}", remote_script_path, script_args);
        let mut exec_env = HashMap::new();
        exec_env.insert("INSTANCE_ID".to_string(), instance_id.to_string());
        exec_env.insert("CMD".to_string(), bash_cmd);

        Self::run_provider_script(pm, provider_path, provider_manifest, "exec", &exec_env, app, log_event)
    }

    /// Read a file from inside an instance (for config, auth, etc.)
    pub fn read_instance_file(
        pm: &PluginManager,
        provider_path: &Path,
        provider_manifest: &PluginManifest,
        instance_id: &str,
        remote_path: &str,
        app: Option<&tauri::AppHandle>,
    ) -> Result<serde_json::Value, PluginError> {
        let cmd = format!("cat {}", remote_path);
        let mut env = HashMap::new();
        env.insert("INSTANCE_ID".to_string(), instance_id.to_string());
        env.insert("CMD".to_string(), cmd);

        Self::run_provider_script(pm, provider_path, provider_manifest, "exec", &env, app, None)
    }

    /// Write a file inside an instance
    pub fn write_instance_file(
        pm: &PluginManager,
        provider_path: &Path,
        provider_manifest: &PluginManifest,
        instance_id: &str,
        remote_path: &str,
        content: &str,
        app: Option<&tauri::AppHandle>,
    ) -> Result<serde_json::Value, PluginError> {
        let cmd = format!(
            "mkdir -p $(dirname {path}) && cat << 'CLAWSET_EOF' > {path}\n{content}\nCLAWSET_EOF",
            path = remote_path,
            content = content
        );
        let mut env = HashMap::new();
        env.insert("INSTANCE_ID".to_string(), instance_id.to_string());
        env.insert("CMD".to_string(), cmd);

        Self::run_provider_script(pm, provider_path, provider_manifest, "exec", &env, app, None)
    }
}

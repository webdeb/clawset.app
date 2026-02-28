use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use rquickjs::{Context, Runtime, Function, Object, CatchResultExt};
use tauri::Emitter;

use crate::traits::PluginError;

/// Result of running a shell command from JS
#[derive(Debug, Clone, serde::Serialize)]
pub struct ShellResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// Runs plugin .js scripts in an embedded QuickJS engine with the clawset.* API injected.
pub struct JsRuntime;

impl JsRuntime {
    /// Run a JS script file with environment variables and return the result as JSON.
    pub fn run_script(
        script_path: &Path,
        env: &HashMap<String, String>,
        app: Option<&tauri::AppHandle>,
        log_event: Option<&str>,
    ) -> Result<serde_json::Value, PluginError> {
        let script_content = std::fs::read_to_string(script_path)
            .map_err(|e| PluginError::ScriptNotFound(format!("{:?}: {}", script_path, e)))?;

        let rt = Runtime::new().map_err(|e| PluginError::JsError(format!("Failed to create JS runtime: {}", e)))?;
        let ctx = Context::full(&rt).map_err(|e| PluginError::JsError(format!("Failed to create JS context: {}", e)))?;

        let env_clone = env.clone();
        let log_event_owned = log_event.map(|s| s.to_string());
        let app_clone = app.cloned();

        ctx.with(|ctx| {
            let globals = ctx.globals();

            // Create the `clawset` namespace object
            let clawset = Object::new(ctx.clone())
                .map_err(|e| PluginError::JsError(format!("Failed to create clawset object: {}", e)))?;

            // We define __clawset_shell_exec as the native function and wrap it in JS
            // to provide the ergonomic clawset.shell(cmd, args) API.

            // Native shell exec function
            let shell_exec_fn = Function::new(ctx.clone(), move |cmd: String, args_json: String| -> String {
                let args: Vec<String> = serde_json::from_str(&args_json).unwrap_or_default();
                let output = Command::new(&cmd).args(&args).output();
                match output {
                    Ok(out) => {
                        let result = ShellResult {
                            stdout: String::from_utf8_lossy(&out.stdout).to_string(),
                            stderr: String::from_utf8_lossy(&out.stderr).to_string(),
                            exit_code: out.status.code().unwrap_or(-1),
                        };
                        serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string())
                    }
                    Err(e) => {
                        let result = ShellResult {
                            stdout: String::new(),
                            stderr: format!("Failed to execute {}: {}", cmd, e),
                            exit_code: -1,
                        };
                        serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string())
                    }
                }
            }).map_err(|e| PluginError::JsError(format!("Failed to create shell fn: {}", e)))?;

            globals.set("__clawset_shell_exec", shell_exec_fn)
                .map_err(|e| PluginError::JsError(format!("Failed to set shell fn: {}", e)))?;

            // Native env lookup
            let env_map = env_clone.clone();
            let env_fn = Function::new(ctx.clone(), move |key: String| -> String {
                env_map.get(&key).cloned().unwrap_or_default()
            }).map_err(|e| PluginError::JsError(format!("Failed to create env fn: {}", e)))?;

            clawset.set("env", env_fn)
                .map_err(|e| PluginError::JsError(format!("Failed to set env fn: {}", e)))?;

            // Platform info
            let platform = if cfg!(target_os = "macos") { "macos" }
                else if cfg!(target_os = "windows") { "windows" }
                else { "linux" };
            clawset.set("platform", platform)
                .map_err(|e| PluginError::JsError(format!("Failed to set platform: {}", e)))?;

            let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "amd64" };
            clawset.set("arch", arch)
                .map_err(|e| PluginError::JsError(format!("Failed to set arch: {}", e)))?;

            // Native log function
            let app_for_log = app_clone.clone();
            let log_event_for_log = log_event_owned.clone();
            let log_fn = Function::new(ctx.clone(), move |msg: String| {
                eprintln!("[plugin] {}", msg);
                if let (Some(app), Some(event)) = (&app_for_log, &log_event_for_log) {
                    let _ = app.emit(event.as_str(), &msg);
                }
            }).map_err(|e| PluginError::JsError(format!("Failed to create log fn: {}", e)))?;

            clawset.set("log", log_fn)
                .map_err(|e| PluginError::JsError(format!("Failed to set log fn: {}", e)))?;

            // Native readFile function
            let read_file_fn = Function::new(ctx.clone(), |path: String| -> String {
                std::fs::read_to_string(&path).unwrap_or_default()
            }).map_err(|e| PluginError::JsError(format!("Failed to create readFile fn: {}", e)))?;

            clawset.set("readFile", read_file_fn)
                .map_err(|e| PluginError::JsError(format!("Failed to set readFile fn: {}", e)))?;

            // Native writeFile function
            let write_file_fn = Function::new(ctx.clone(), |path: String, content: String| -> bool {
                if let Some(parent) = Path::new(&path).parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                std::fs::write(&path, &content).is_ok()
            }).map_err(|e| PluginError::JsError(format!("Failed to create writeFile fn: {}", e)))?;

            clawset.set("writeFile", write_file_fn)
                .map_err(|e| PluginError::JsError(format!("Failed to set writeFile fn: {}", e)))?;

            // Set the clawset object on globals
            globals.set("clawset", clawset)
                .map_err(|e| PluginError::JsError(format!("Failed to set clawset global: {}", e)))?;

            // Wrap the script in a function that provides a nice shell() API
            let wrapper = format!(r#"
                (function() {{
                    // clawset.shell(command, args) → {{ stdout, stderr, exitCode }}
                    clawset.shell = function(cmd, args) {{
                        var argsJson = JSON.stringify(args || []);
                        var resultJson = __clawset_shell_exec(cmd, argsJson);
                        var result = JSON.parse(resultJson);
                        return {{
                            stdout: result.stdout,
                            stderr: result.stderr,
                            exitCode: result.exit_code
                        }};
                    }};

                    // Run the plugin script
                    {script}
                }})()
            "#, script = script_content);

            // Execute and collect result
            let result: rquickjs::Value = ctx.eval(wrapper.as_bytes())
                .catch(&ctx)
                .map_err(|e| PluginError::JsError(format!("Script execution error: {:?}", e)))?;

            // Convert JS result to serde_json::Value
            js_value_to_json(&result)
        })
    }
}

/// Convert a QuickJS value to a serde_json::Value
fn js_value_to_json(val: &rquickjs::Value) -> Result<serde_json::Value, PluginError> {
    if val.is_undefined() || val.is_null() {
        Ok(serde_json::Value::Null)
    } else if let Some(b) = val.as_bool() {
        Ok(serde_json::Value::Bool(b))
    } else if let Some(n) = val.as_int() {
        Ok(serde_json::json!(n))
    } else if let Some(n) = val.as_float() {
        Ok(serde_json::json!(n))
    } else if let Some(s) = val.as_string() {
        let s = s.to_string().map_err(|e| PluginError::JsError(format!("String conversion error: {}", e)))?;
        Ok(serde_json::Value::String(s))
    } else if val.is_array() {
        let arr: rquickjs::Array = val.clone().into_array()
            .ok_or_else(|| PluginError::JsError("Expected array".to_string()))?;
        let mut vec = Vec::new();
        for i in 0..arr.len() {
            let item: rquickjs::Value = arr.get(i)
                .map_err(|e| PluginError::JsError(format!("Array access error: {}", e)))?;
            vec.push(js_value_to_json(&item)?);
        }
        Ok(serde_json::Value::Array(vec))
    } else if val.is_object() {
        let obj = val.as_object()
            .ok_or_else(|| PluginError::JsError("Expected object".to_string()))?;
        let mut map = serde_json::Map::new();
        for item in obj.props::<String, rquickjs::Value>() {
            let (key, value) = item.map_err(|e| PluginError::JsError(format!("Object iteration error: {}", e)))?;
            map.insert(key, js_value_to_json(&value)?);
        }
        Ok(serde_json::Value::Object(map))
    } else {
        Ok(serde_json::Value::Null)
    }
}

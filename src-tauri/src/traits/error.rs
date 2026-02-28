use std::fmt;

#[derive(Debug)]
pub enum PluginError {
    /// Script file not found or unreadable
    ScriptNotFound(String),
    /// Script execution failed
    ScriptFailed { message: String, exit_code: Option<i32> },
    /// Manifest is invalid or missing required fields
    ManifestError(String),
    /// Plugin not found in registry
    PluginNotFound(String),
    /// Capability not supported by this provider
    UnsupportedCapability(String),
    /// An I/O error
    Io(std::io::Error),
    /// JS runtime error
    JsError(String),
    /// Generic error
    Other(String),
}

impl fmt::Display for PluginError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PluginError::ScriptNotFound(path) => write!(f, "Script not found: {}", path),
            PluginError::ScriptFailed { message, exit_code } => {
                write!(f, "Script failed: {}", message)?;
                if let Some(code) = exit_code {
                    write!(f, " (exit code: {})", code)?;
                }
                Ok(())
            }
            PluginError::ManifestError(msg) => write!(f, "Manifest error: {}", msg),
            PluginError::PluginNotFound(id) => write!(f, "Plugin not found: {}", id),
            PluginError::UnsupportedCapability(cap) => write!(f, "Unsupported capability: {}", cap),
            PluginError::Io(e) => write!(f, "I/O error: {}", e),
            PluginError::JsError(msg) => write!(f, "JS error: {}", msg),
            PluginError::Other(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for PluginError {}

impl From<std::io::Error> for PluginError {
    fn from(e: std::io::Error) -> Self {
        PluginError::Io(e)
    }
}

impl From<PluginError> for String {
    fn from(e: PluginError) -> String {
        e.to_string()
    }
}

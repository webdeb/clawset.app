use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::fs;

use crate::traits::{PluginManifest, PluginError};

/// Manages plugin lifecycle: discovery, install (git clone), update, remove.
pub struct PluginManager {
    plugin_dir: PathBuf,
}

impl PluginManager {
    pub fn new(plugin_dir: PathBuf) -> Self {
        // Ensure the plugin directory exists
        let _ = fs::create_dir_all(&plugin_dir);
        PluginManager { plugin_dir }
    }

    /// Discover all installed plugins by reading their manifest.yaml files.
    pub fn discover(&self) -> Vec<(PathBuf, PluginManifest)> {
        let mut plugins = Vec::new();
        let entries = match fs::read_dir(&self.plugin_dir) {
            Ok(e) => e,
            Err(_) => return plugins,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let manifest_path = path.join("manifest.yaml");
                if manifest_path.exists() {
                    match self.load_manifest(&manifest_path) {
                        Ok(m) => plugins.push((path, m)),
                        Err(e) => eprintln!("Warning: skipping plugin at {:?}: {}", path, e),
                    }
                }
            }
        }
        plugins
    }

    /// Load and parse a manifest.yaml file
    pub fn load_manifest(&self, path: &Path) -> Result<PluginManifest, PluginError> {
        let content = fs::read_to_string(path)
            .map_err(|e| PluginError::ManifestError(format!("Could not read {:?}: {}", path, e)))?;
        let manifest: PluginManifest = serde_yaml::from_str(&content)
            .map_err(|e| PluginError::ManifestError(format!("Invalid YAML in {:?}: {}", path, e)))?;
        Ok(manifest)
    }

    /// Get all plugins grouped by type
    pub fn plugins_by_type(&self) -> HashMap<String, Vec<(PathBuf, PluginManifest)>> {
        let mut by_type: HashMap<String, Vec<(PathBuf, PluginManifest)>> = HashMap::new();
        for (path, manifest) in self.discover() {
            by_type.entry(manifest.plugin_type.clone()).or_default().push((path, manifest));
        }
        by_type
    }

    /// Get a specific plugin by its ID
    pub fn get_plugin(&self, id: &str) -> Option<(PathBuf, PluginManifest)> {
        self.discover().into_iter().find(|(_, m)| m.id == id)
    }

    /// Install a plugin from a git URL
    pub fn install_from_git(&self, git_url: &str) -> Result<PluginManifest, PluginError> {
        // Extract repo name from URL for the directory name
        let repo_name = git_url
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or("plugin")
            .trim_end_matches(".git");

        let target_dir = self.plugin_dir.join(repo_name);
        if target_dir.exists() {
            return Err(PluginError::Other(format!(
                "Plugin directory already exists: {:?}. Use update or remove first.",
                target_dir
            )));
        }

        // Git clone
        let output = std::process::Command::new("git")
            .args(["clone", "--depth", "1", git_url])
            .arg(&target_dir)
            .output()
            .map_err(|e| PluginError::Other(format!("Failed to run git clone: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(PluginError::Other(format!("git clone failed: {}", stderr)));
        }

        // Load manifest
        let manifest_path = target_dir.join("manifest.yaml");
        self.load_manifest(&manifest_path)
    }

    /// Update a plugin (git pull)
    pub fn update_plugin(&self, id: &str) -> Result<(), PluginError> {
        let (path, _) = self.get_plugin(id)
            .ok_or_else(|| PluginError::PluginNotFound(id.to_string()))?;

        let output = std::process::Command::new("git")
            .args(["pull", "--ff-only"])
            .current_dir(&path)
            .output()
            .map_err(|e| PluginError::Other(format!("Failed to run git pull: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(PluginError::Other(format!("git pull failed: {}", stderr)));
        }

        Ok(())
    }

    /// Remove a plugin
    pub fn remove_plugin(&self, id: &str) -> Result<(), PluginError> {
        let (path, _) = self.get_plugin(id)
            .ok_or_else(|| PluginError::PluginNotFound(id.to_string()))?;

        fs::remove_dir_all(&path)
            .map_err(|e| PluginError::Other(format!("Failed to remove plugin: {}", e)))?;

        Ok(())
    }

    /// Resolve full path to a script within a plugin
    pub fn resolve_script_path(&self, plugin_path: &Path, script_ref: &str) -> PathBuf {
        plugin_path.join(script_ref)
    }

    /// Get base plugin directory
    pub fn plugin_dir(&self) -> &Path {
        &self.plugin_dir
    }
}

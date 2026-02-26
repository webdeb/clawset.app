use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::Emitter;

pub fn run_and_stream(app: &tauri::AppHandle, mut command: Command, error_prefix: &str) -> Result<(), String> {
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
pub async fn install_openclaw(app: tauri::AppHandle, instance_name: &str, memory: &str, cpus: &str, disk: &str) -> Result<(), String> {
    let _ = app.emit("provision-log", format!("Starting setup for {}", instance_name));

    // Launch an Ubuntu LTS instance with the designated parameters
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

    let _ = app.emit("provision-log", "Instance created successfully! You can now configure and provision it.".to_string());
    Ok(())
}

#[tauri::command]
pub async fn provision_instance(app: tauri::AppHandle, instance_name: &str, shared_folder: &str) -> Result<(), String> {
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

    // 3. Transfer provisioning script to the VM
    let _ = app.emit("provision-log", "Transferring provisioning script...".to_string());
    
    let mut transfer = Command::new("multipass");
    transfer.args([
        "transfer",
        "setup-instance/provision.sh",
        &format!("{}:provision.sh", instance_name),
    ]);
    run_and_stream(&app, transfer, "Failed to transfer provision.sh")?;

    // 4. Execute provisioning script inside the VM asynchronously
    let _ = app.emit("provision-log", "Starting background provisioning of Node and OpenClaw within the VM...".to_string());
    
    let async_script = r#"
        nohup bash -c '
            touch /tmp/provisioning
            echo "==> Starting Provisioning" > /tmp/provision.log
            bash provision.sh >> /tmp/provision.log 2>&1
            echo "==> Provisioning Complete" >> /tmp/provision.log
            rm -f /tmp/provisioning
        ' </dev/null >/dev/null 2>&1 &
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

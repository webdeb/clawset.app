// Create a new Multipass instance
var name = clawset.env("NAME");
var cpus = clawset.env("CPUS") || "2";
var memory = clawset.env("MEMORY") || "4G";
var disk = clawset.env("DISK") || "20G";
var image = clawset.env("IMAGE") || "lts";

clawset.log("Launching Ubuntu " + image + " instance '" + name + "' (cpus=" + cpus + ", memory=" + memory + ", disk=" + disk + ")...");

var result = clawset.shell("multipass", [
    "launch", "-v", image,
    "--name", name,
    "--cpus", cpus,
    "--memory", memory,
    "--disk", disk
]);

if (result.exitCode !== 0) {
    throw new Error("Failed to launch instance: " + result.stderr);
}

clawset.log("Instance '" + name + "' created successfully!");

return {
    id: name,
    name: name,
    status: "Running",
    provider: "multipass"
};

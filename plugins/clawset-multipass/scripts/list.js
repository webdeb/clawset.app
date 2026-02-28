// List all Multipass instances in clawset standard format
var result = clawset.shell("multipass", ["list", "--format", "json"]);

if (result.exitCode !== 0) {
    clawset.log("multipass list failed: " + result.stderr);
    return [];
}

var data = JSON.parse(result.stdout);
var instances = (data.list || []).map(function (vm) {
    var ip = "";
    if (vm.ipv4 && vm.ipv4.length > 0) {
        ip = vm.ipv4[0];
    }
    return {
        id: vm.name,
        name: vm.name,
        status: vm.state || "Unknown",
        ip: ip,
        provider: "multipass",
        meta: {
            os: vm.release || "Ubuntu"
        }
    };
});

return instances;

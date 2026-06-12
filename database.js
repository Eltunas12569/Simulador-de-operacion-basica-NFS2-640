// ==========================================================================
// BASE DE DATOS LOCAL DE DISPOSITIVOS (PERSISTENTE)
// ==========================================================================

const DB_KEY = 'notifier_devices_db';

// Base de datos "de fábrica" (si es la primera vez que se abre el panel)
const defaultDevices = [
    { dir: "L1D01", tipo: "PHOTO SMOKE", etiqueta: "LAB INTERIOR", estado: "NORMAL", valor: "0.0% / FT" },
    { dir: "L1D02", tipo: "HEAT DETECTOR", etiqueta: "OFICINAS PRINCIPALES", estado: "NORMAL", valor: "25 C" },
    { dir: "L1M03", tipo: "PULL STATION", etiqueta: "SALIDA ALMACÉN", estado: "NORMAL", valor: "NORMAL" },
    { dir: "L1D04", tipo: "PHOTO SMOKE", etiqueta: "PASILLO 1", estado: "NORMAL", valor: "0.0% / FT" },
    { dir: "L1M05", tipo: "CONTROL MOD", etiqueta: "ALMACEN", estado: "NORMAL", valor: "NORMAL" }
];

window.db = {
    devices: [],
    load: function() {
        const stored = localStorage.getItem(DB_KEY);
        if (stored) {
            this.devices = JSON.parse(stored); // Cargar si ya existen
        } else {
            this.devices = JSON.parse(JSON.stringify(defaultDevices));
            this.save();
        }
    },
    save: function() {
        localStorage.setItem(DB_KEY, JSON.stringify(this.devices));
    },
    add: function(device) {
        this.devices.push(device);
        this.save(); // Guarda permanentemente al añadir
    },
    update: function(dir, estado, valor) {
        const dev = this.devices.find(d => d.dir === dir);
        if (dev) {
            dev.estado = estado;
            dev.valor = valor;
            this.save();
        }
    },
    resetNormal: function() {
        this.devices.forEach(d => {
            d.estado = "NORMAL";
            if(d.tipo.includes("SMOKE")) d.valor = "0.0% / FT";
            else if(d.tipo.includes("HEAT")) d.valor = "25 C";
            else d.valor = "NORMAL";
        });
        this.save(); // Guarda el reseteo
    },
    remove: function(dir) {
        const initialLength = this.devices.length;
        this.devices = this.devices.filter(d => d.dir !== dir);
        if (this.devices.length < initialLength) {
            this.save();
            return true;
        }
        return false;
    },
    rename: function(dir, newName) {
        const dev = this.devices.find(d => d.dir === dir);
        if (dev) {
            dev.etiqueta = newName;
            this.save();
            return true;
        }
        return false;
    },
    factoryReset: function() {
        this.devices = JSON.parse(JSON.stringify(defaultDevices));
        this.save();
    }
};

// Inicializar carga al importar el script
window.db.load();
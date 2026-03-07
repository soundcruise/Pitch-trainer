const fs = require('fs');

// Mock localStorage and DOM
global.localStorage = {
    store: {},
    getItem(key) { return this.store[key] || null; },
    setItem(key, value) { this.store[key] = value; }
};

global.document = {
    getElementById: () => ({ textContent: '', value: '' }),
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add: () => { }, remove: () => { } }, appendChild: () => { } })
};

global.window = {};

const scriptContent = fs.readFileSync('script.js', 'utf8');

// We need to evaluate the class definition and instantiate it
eval(scriptContent);

try {
    const app = new PitchTrainerApp();
    app.init();

    // Check initial load
    console.log("After init:");
    console.log("Custom Chords Length:", app.customChords.length);
    console.log("Custom Progressions Length:", app.customProgressions.length);

    if (app.customProgressions.length > 0) {
        console.log("First Progression Name:", app.customProgressions[0].name);
    }

    // Simulate user saving and reloading
    console.log("\nSimulating save and reload...");
    app.saveCustomData();

    const app2 = new PitchTrainerApp();
    app2.init();

    console.log("After reload:");
    console.log("Custom Chords Length:", app2.customChords.length);
    console.log("Custom Progressions Length:", app2.customProgressions.length);

} catch (e) {
    console.error("Error during execution:", e);
}

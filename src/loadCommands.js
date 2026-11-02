const fs = require('node:fs');
const path = require('node:path');

/** Reads every command file under src/commands/<category>/*.js */
function loadCommands() {
  const commands = new Map();
  const root = path.join(__dirname, 'commands');

  for (const category of fs.readdirSync(root)) {
    const dir = path.join(root, category);
    if (!fs.statSync(dir).isDirectory()) continue;

    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      const command = require(path.join(dir, file));
      if (!command.data || !command.execute) {
        console.warn(`[WARN] ${category}/${file} is missing "data" or "execute"`);
        continue;
      }
      commands.set(command.data.name, command);
    }
  }
  return commands;
}

module.exports = { loadCommands };

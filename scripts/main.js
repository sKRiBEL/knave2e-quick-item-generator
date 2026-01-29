import { registerItemGenerator } from "./item-generator.js";

const MODULE_ID = "knave2e-quick-item-generator";

function registerSettings() {
  game.settings.register(MODULE_ID, "enableImageStep", {
    name: "Enable image selection step",
    hint: "Adds a step to pick an item image from configured folders.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, "imageRootFolder", {
    name: "Default image folder",
    hint: "Base folder for images when no type-specific folder is set (e.g. assets/knave/items).",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  game.settings.register(MODULE_ID, "imageFoldersByType", {
    name: "Image folders by item type (JSON)",
    hint: "Map item types to folders, e.g. {\"weapon\":\"assets/knave/weapons\",\"armor\":\"assets/knave/armor\"}.",
    scope: "world",
    config: true,
    type: String,
    default: "{}",
  });
}

Hooks.once("init", () => {
  registerSettings();
  registerItemGenerator();
});

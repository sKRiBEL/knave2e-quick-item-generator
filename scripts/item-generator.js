const MODULE_ID = "knave2e-quick-item-generator";

const DEFAULT_STEPS = [
  {
    key: "name",
    label: "Item name",
    placeholder: "Short name",
  },
  {
    key: "type",
    label: "Item type",
    placeholder: "weapon, armor, equipment, lightSource, spellbook, monsterAttack",
  },
  {
    key: "cost",
    label: "Cost",
    placeholder: "e.g. 50",
  },
  {
    key: "damageRoll",
    label: "Damage roll",
    placeholder: "e.g. 1d8 or d8",
  },
  {
    key: "description",
    label: "Description",
    placeholder: "Short description",
  },
];

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export class ItemGeneratorApp extends Application {
  constructor(options = {}) {
    super(options);
    this.steps = options.steps ?? this.#buildSteps();
    this.stepIndex = 0;
    this.data = {};
    this.imageOptions = [];
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "knave2e-item-generator",
      title: "Knave 2e Item Generator",
      template: `modules/${MODULE_ID}/templates/item-generator.html`,
      width: 420,
      height: "auto",
      resizable: false,
    });
  }

  getData() {
    const step = this.steps[this.stepIndex];
    const summary = this.#buildSummary();
    return {
      stepNumber: this.stepIndex + 1,
      totalSteps: this.steps.length,
      prompt: step.label,
      placeholder: step.placeholder ?? "",
      value: this.data[step.key] ?? "",
      isImageStep: step.key === "image",
      imageOptions: this.imageOptions,
      confirm: Boolean(step.confirm),
      summary,
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const input = html.find("input[name='prompt-input']");
    input.trigger("focus");

    input.on("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const value = event.currentTarget.value.trim();
      this.#advance(value);
    });
  }

  async #advance(value) {
    const step = this.steps[this.stepIndex];
    if (!step.confirm) {
      this.data[step.key] = value;
    }

    if (this.stepIndex < this.steps.length - 1) {
      if (step.key === "type") {
        await this.#loadImageOptions();
      }
      this.stepIndex += 1;
      this.render();
      return;
    }

    await this.#createItem();
    this.close();
  }

  #buildSummary() {
    const entries = this.steps
      .filter((step) => !step.confirm)
      .map((step) => {
        const value = this.data[step.key];
        if (!value) return null;
        return `${step.label}: ${value}`;
      })
      .filter(Boolean);

    return entries.join("\n");
  }

  #buildSteps() {
    const steps = [...DEFAULT_STEPS];
    if (game.settings.get(MODULE_ID, "enableImageStep")) {
      steps.splice(2, 0, {
        key: "image",
        label: "Item image",
        placeholder: "Type or pick an image path",
      });
    }
    steps.push({
      key: "confirm",
      label: "Press Enter to create the item",
      placeholder: "",
      confirm: true,
    });
    return steps;
  }

  async #loadImageOptions() {
    if (!this.steps.find((step) => step.key === "image")) {
      return;
    }

    const itemType = this.#normalizeItemType(this.data.type) ?? this.data.type ?? "";
    const folder = this.#resolveImageFolder(itemType);
    if (!folder) {
      this.imageOptions = [];
      return;
    }

    try {
      const response = await FilePicker.browse("data", folder);
      this.imageOptions = response.files.filter((file) =>
        IMAGE_EXTENSIONS.has(file.slice(file.lastIndexOf(".")).toLowerCase()),
      );
    } catch (error) {
      this.imageOptions = [];
      console.warn(`${MODULE_ID} | Unable to browse image folder`, error);
    }
  }

  #resolveImageFolder(itemType) {
    const rootFolder = game.settings.get(MODULE_ID, "imageRootFolder")?.trim();
    const mapping = game.settings.get(MODULE_ID, "imageFoldersByType")?.trim();
    if (!mapping) {
      return rootFolder;
    }

    try {
      const parsed = JSON.parse(mapping);
      if (itemType && typeof parsed === "object" && parsed[itemType]) {
        return parsed[itemType];
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Invalid image folder mapping JSON`, error);
    }

    return rootFolder;
  }

  async #createItem() {
    const itemName = this.data.name || "New Item";
    const rawType = this.data.type;
    const normalizedType = this.#normalizeItemType(rawType);
    const itemType = normalizedType ?? "equipment";
    const itemData = {
      name: itemName,
      type: itemType,
      system: {},
      flags: {
        [MODULE_ID]: {
          ...this.data,
        },
      },
    };

    if (this.data.image) {
      itemData.img = this.data.image;
    }

    if (!normalizedType && rawType) {
      ui.notifications.warn(
        `Unknown item type "${rawType}". Defaulting to equipment.`,
      );
    }

    const costValue = this.#parseInteger(this.data.cost);
    if (costValue !== null) {
      foundry.utils.setProperty(itemData, "system.cost", costValue);
    }

    const damageRoll = this.#normalizeDamageRoll(this.data.damageRoll);
    if (damageRoll && (itemType === "weapon" || itemType === "monsterAttack")) {
      foundry.utils.setProperty(itemData, "system.damageRoll", damageRoll);
    }
    foundry.utils.setProperty(itemData, "system.description", this.data.description ?? "");

    try {
      await Item.create(itemData, { renderSheet: true });
    } catch (error) {
      ui.notifications.error("Unable to create the item. Check the console for details.");
      console.error(`${MODULE_ID} | Item creation failed`, error, itemData);
    }
  }

  #normalizeItemType(rawType) {
    if (!rawType) return null;
    const cleaned = String(rawType).trim().toLowerCase();
    if (!cleaned) return null;

    const normalized = cleaned
      .replace(/\s+/g, "")
      .replace(/[-_]/g, "");

    const mapping = {
      armor: "armor",
      armour: "armor",
      equipment: "equipment",
      gear: "equipment",
      item: "equipment",
      lightsource: "lightSource",
      light: "lightSource",
      torch: "lightSource",
      spellbook: "spellbook",
      weapon: "weapon",
      monsterattack: "monsterAttack",
      attack: "monsterAttack",
    };

    const mapped = mapping[normalized];
    if (!mapped) return null;
    return mapped;
  }

  #parseInteger(value) {
    if (value === null || value === undefined) return null;
    const match = String(value).match(/-?\d+/);
    if (!match) return null;
    const parsed = Number.parseInt(match[0], 10);
    if (Number.isNaN(parsed)) return null;
    return Math.max(parsed, 0);
  }

  #normalizeDamageRoll(rawValue) {
    if (!rawValue) return null;
    const trimmed = String(rawValue).trim();
    if (!trimmed) return null;
    if (/^d\d+$/i.test(trimmed)) {
      return `1${trimmed.toLowerCase()}`;
    }
    return trimmed;
  }
}

export function registerItemGenerator() {
  game.keybindings.register(MODULE_ID, "open-item-generator", {
    name: "Open Item Generator",
    hint: "Open the keyboard-first item generator wizard.",
    editable: [{ key: "KeyI", modifiers: ["CTRL", "SHIFT"] }],
    onDown: () => {
      const app = new ItemGeneratorApp();
      app.render(true);
      return true;
    },
  });
}

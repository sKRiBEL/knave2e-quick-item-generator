import { SYSTEM } from '../config/system.mjs';
import Knave2eActorType from './actor-type.mjs';

export default class Knave2eCharacter extends Knave2eActorType {
    static defineSchema() {
        const fields = foundry.data.fields;
        const requiredInteger = { required: true, nullable: false, integer: true };
        const schema = super.defineSchema();

        schema.abilities = new fields.SchemaField(
            Object.values(SYSTEM.ABILITIES.ABILITIES).reduce((obj, ability) => {
                obj[ability.id] = new fields.SchemaField({
                    value: new fields.NumberField({ ...requiredInteger, initial: 0 }),
                    label: new fields.StringField({ initial: ability.label }),
                    abbreviation: new fields.StringField({
                        initial: ability.abbreviation,
                    }),
                    detail: new fields.StringField({ initial: ability.detail }),
                });
                return obj;
            }, {})
        );

        schema.ammo = new fields.SchemaField({
            arrow: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
            bullet: new fields.NumberField({
                ...requiredInteger,
                initial: 0,
                min: 0,
            }),
        });
        schema.armorPoints = new fields.NumberField({
            ...requiredInteger,
            initial: 0,
        });
        schema.blessings = new fields.SchemaField({
            value: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
            max: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
        });
        schema.careers = new fields.StringField({});
        schema.coins = new fields.NumberField({
            ...requiredInteger,
            initial: 0,
            min: 0,
        });
        schema.companions = new fields.SchemaField({
            value: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
            max: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
        });
        schema.label = new fields.StringField({});
        schema.slots = new fields.SchemaField({
            value: new fields.NumberField({
                required: true,
                nullable: false,
                integer: false,
                initial: 0,
                min: 0,
                step: 0.01,
            }),
            max: new fields.NumberField({
                required: true,
                nullable: false,
                integer: false,
                initial: 10,
                min: 0,
                step: 0.01,
            }),
        });
        schema.spells = new fields.SchemaField({
            value: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
            max: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
        });
        schema.wounds = new fields.SchemaField({
            value: new fields.NumberField({
                ...requiredInteger,
                initial: 10,
                min: 0,
            }),
            max: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 }),
            progress: new fields.NumberField({
                ...requiredInteger,
                initial: 100,
                min: 0,
            }),
        });
        schema.xp = new fields.SchemaField({
            value: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
            progress: new fields.NumberField({
                ...requiredInteger,
                initial: 0,
                min: 0,
                max: 100,
            }),
        });

        schema.hitPoints.fields.value.min = -999;
        return schema;
    }

    prepareBaseData() {}

    prepareDerivedData() {
        this._deriveBlessings();
        this._deriveCompanions();
        this._deriveHP();
        this._deriveLevel();
        this._deriveSlots();
        this._deriveSpells();
    }

    _deriveBlessings() {
        if (game.settings.get('knave2e', 'automaticBlessings')) {
            this.blessings.max = this.abilities.charisma.value;
        }
    }

    _deriveCompanions() {
        if (game.settings.get('knave2e', 'automaticCompanions')) {
            this.companions.max = this.abilities.charisma.value;
        }
    }

    _deriveHP() {
        if (game.settings.get('knave2e', 'automaticWounds')) {
            this.wounds.max = 10 + this.abilities.constitution.value;
        }
        this.hitPoints.value = Math.min(this.hitPoints.value, this.hitPoints.max);
        this.wounds.value = Math.min(this.wounds.value, this.wounds.max);

        //Overflow any negative HP into wounds
        if (this.hitPoints.value < 0) {
            const overflowDamage = -this.hitPoints.value;
            this.hitPoints.value = 0;

            this.wounds.value = this.wounds.value - overflowDamage;
            if (this.wounds.value <= 0) {
                this.wounds.value = 0;
            }
        }

        // Update progress bars for HP/wounds
        this.hitPoints.progress = Math.floor((this.hitPoints.value / this.hitPoints.max) * 100);

        this.wounds.progress = Math.floor((this.wounds.value / this.wounds.max) * 100);
    }

    _deriveLevel() {
        if (game.settings.get('knave2e', 'automaticLevel') === false) {
            this.xp.progress = 0;
        } else {
            // Ignore level keys with an 'xp' value < 0
            //const validLevels = Object.entries(SYSTEM.LEVELS.LEVELS)
            const validLevels = Object.entries(JSON.parse(game.settings.get('knave2e', 'xpPerLevel')))
                .filter(([_, value]) => value.xp >= 0)
                .map(([key, value]) => ({
                    level: parseInt(key),
                    xp: value.xp,
                    label: value.label,
                }));

            // Determine level from this.xp.value
            for (let i = 0; i < validLevels.length - 1; i++) {
                const currentLevel = validLevels[i];
                const nextLevel = validLevels[i + 1];

                if (this.xp.value >= currentLevel.xp && this.xp.value < nextLevel.xp) {
                    (this.level = currentLevel.level),
                        (this.label = currentLevel.label),
                        (this.xp.progress = Math.floor(
                            ((this.xp.value - currentLevel.xp) / (nextLevel.xp - currentLevel.xp)) * 100
                        ));
                    return;
                }
            }

            const highestLevel = validLevels[validLevels.length - 1];
            (this.level = highestLevel.level),
                (this.label = game.i18n.localize(highestLevel.label)),
                (this.xp.progress = 100);
        }
    }
    
    _deriveSlots() {
        if (game.settings.get('knave2e', 'automaticSlots') === true) {
            this.slots.max = 10 + this.abilities['constitution'].value - (this.wounds.max - this.wounds.value);
        }
    
        const coinsPerSlot = game.settings.get('knave2e', 'coinsPerSlot');
        const arrowsPerSlot = game.settings.get('knave2e', 'arrowsPerSlot');
        const bulletsPerSlot = game.settings.get('knave2e', 'slingBulletsPerSlot');
    
        // Sum coin slots
        const coinSlots = coinsPerSlot === 0 ? 0 : this.coins / coinsPerSlot;
    
        // Sum ammo slots
        const arrowSlots = arrowsPerSlot === 0 ? 0 : this.ammo.arrow / arrowsPerSlot;
        const bulletSlots = bulletsPerSlot === 0 ? 0 : this.ammo.bullet / bulletsPerSlot;
        const ammoSlots = arrowSlots + bulletSlots;
    
        const nonItemSlots = ammoSlots + coinSlots;
        this.slots.value = nonItemSlots;
    
        const actor = this.parent;
    
        // Track whether we already had dropped items BEFORE this pass
        const hadDroppedItemsBefore = actor.items.contents.some(i =>
            i.system.dropped === true || (i.system.droppedCount ?? 0) > 0
        );
    
        const { itemSlots, updates } = this.deriveHeldItemSlots();
        this.slots.value += itemSlots;
    
        let allUpdates = [...updates];
        const remainder = this.slots.value - this.slots.max;
    
        if (remainder > 0) {
            allUpdates = allUpdates.concat(this.deriveDroppedItems(remainder));
        }
    
        // Determine if we WILL have dropped items after updates
        const willHaveDroppedItems =
            actor.items.contents.some(i =>
                i.system.dropped === true || (i.system.droppedCount ?? 0) > 0
            ) ||
            allUpdates.some(u =>
                u["system.dropped"] === true || (u["system.droppedCount"] ?? 0) > 0
            );
    
        actor._knave2eOverCapWarned ??= false;
    
        // Warn once when we transition into dropping items
        if (!hadDroppedItemsBefore && willHaveDroppedItems && !actor._knave2eOverCapWarned) {
            ui.notifications.warn(
                game.i18n.localize("KNAVE2E.InventoryOverCapacity") ||
                "Your inventory is full. You may need to drop something."
            );
            actor._knave2eOverCapWarned = true;
        }
    
        // Reset warning once inventory is no longer overflowing
        if (!willHaveDroppedItems && actor._knave2eOverCapWarned) {
            actor._knave2eOverCapWarned = false;
        }
    
        const free = remainder < 0 ? Math.abs(remainder) : 0;
        if (free > 0) {
            allUpdates = allUpdates.concat(this.derivePickedUpItems(free));
        }
    
        if (allUpdates.length) {
            this.parent.updateEmbeddedDocuments("Item", allUpdates);
        }
    
        if (game.settings.get('knave2e', 'enforceIntegerSlots') === true) {
            this.slots.value = Math.ceil(this.slots.value);
            this.slots.max = Math.ceil(this.slots.max);
        } else {
            this.slots.value = Math.round(this.slots.value * 100) / 100;
        }
    }
    
    
    _deriveSpells() {
        if (game.settings.get('knave2e', 'automaticSpells')) {
            this.spells.max = this.abilities.intelligence.value;
        }
    }

    deriveHeldItemSlots() {
        const updates = [];
        let itemSlots = 0;
        
        for (const item of this.parent.items.contents) {
            const qty = item.system.quantity ?? 0;
            const slots = item.system.slots ?? 0;
            
          // Respect existing values (don't overwrite them every derived pass)
            let held = Number.isFinite(item.system.held) ? item.system.held : qty;
            let dropped = (typeof item.system.dropped === "boolean") ? item.system.dropped : (held <= 0);
            
          // Normalize
            held = Math.max(0, Math.min(held, qty));
            if (dropped) held = 0;

            const droppedCount = Math.max(0, qty - held);
            const progress = qty > 0 ? ((qty - held) / qty) * 100 : 0;
            
          // Only write if something is missing or inconsistent
            const needsUpdate =
            item.system.held !== held ||
            item.system.dropped !== dropped ||
            item.system.droppedCount !== droppedCount ||
            (item.system.progress ?? progress) !== progress;
            
            if (needsUpdate) {
            updates.push({
                _id: item.id,
                "system.held": held,
                "system.dropped": dropped,
                "system.progress": progress,
                "system.droppedCount": droppedCount
            });
            }
        
          itemSlots += held * slots;
            }
        
        return { itemSlots, updates };
    }
        
    deriveDroppedItems(remainder) {
        const updates = [];
        const sortedItems = [...this.parent.items.contents].sort((a, b) => {
            const at = a._stats?.modifiedTime ?? a.sort ?? 0;
            const bt = b._stats?.modifiedTime ?? b.sort ?? 0;
            return bt - at;
        });
    
        for (const item of sortedItems) {
            if (remainder <= 0) break;
    
            const qty = item.system.quantity ?? 0;
            let held = item.system.held ?? qty;
            let dropped = item.system.dropped ?? false;
    
            while (!dropped && remainder > 0) {
                remainder -= (item.system.slots ?? 0);
                held -= 1;
                if (held <= 0) dropped = true;
            }
    
            const droppedCount = Math.max(0, qty - held); //dropped item counter
            const progress = qty > 0 ? (droppedCount / qty) * 100 : 0;
    
            updates.push({
                _id: item.id,
                "system.held": held,
                "system.dropped": dropped,
                "system.droppedCount": droppedCount, //dropped item counter
                "system.progress": progress
            });
        }
    
        return updates;
    }
    

    derivePickedUpItems(freeSlots) {
        const updates = [];
        const sorted = [...this.parent.items.contents].sort((a, b) => {
            const at = a._stats?.modifiedTime ?? a.sort ?? 0;
            const bt = b._stats?.modifiedTime ?? b.sort ?? 0;
            return bt - at;
        });

        for (const item of sorted) {
            if (freeSlots <= 0) break;
    
            const qty = item.system.quantity ?? 0;
            const slots = item.system.slots ?? 0;
            if (qty <= 0 || slots <= 0) continue;
    
            let held = Number.isFinite(item.system.held) ? item.system.held : qty;
            held = Math.max(0, Math.min(held, qty));
    
            // If item was dropped, start picking it up again
            let dropped = typeof item.system.dropped === "boolean" ? item.system.dropped : false;
    
            while (held < qty && freeSlots >= slots) {
                held += 1;
                freeSlots -= slots;
                dropped = false;
            }
    
            const droppedCount = Math.max(0, qty - held); // ✅ NEW
            const progress = qty > 0 ? (droppedCount / qty) * 100 : 0;
    
            updates.push({
                _id: item.id,
                "system.held": held,
                "system.dropped": dropped,
                "system.droppedCount": droppedCount, // ✅ NEW
                "system.progress": progress
            });
        }
    
        return updates;
    }
    

    _deriveBrokenWeapons() {
        const weapons = this.parent.items.contents.filter(i => i.type === 'weapon');
        const updates = [];
        
            for (const weapon of weapons) {
            const shouldBeBroken = weapon.system.brokenQuantity >= weapon.system.quantity;
            if (weapon.system.broken !== shouldBeBroken) {
                updates.push({
                _id: weapon.id,
                "system.broken": shouldBeBroken,
                "system.brokenQuantity": shouldBeBroken ? weapon.system.quantity : weapon.system.brokenQuantity
                });
            }
            }
        
            if (updates.length) {
            this.parent.updateEmbeddedDocuments("Item", updates);
            }
        }
        

    async getRestData() {
        const actorRestData = await super.getRestData();
        const update = { ...actorRestData, 'system.spells.value': 0 };

        const type = await Dialog.wait({
            title: `${game.i18n.localize('KNAVE2E.RestDialogTitle')}`,
            content: `${game.i18n.localize('KNAVE2E.RestDialogContent')}`,
            buttons: {
                standard: {
                    label: game.i18n.localize('KNAVE2E.Standard'),
                    callback: () => {
                        return 'standard';
                    },
                },
                safe: {
                    label: game.i18n.localize('KNAVE2E.SafeHaven'),
                    callback: () => {
                        return 'safe';
                    },
                },
            },
            default: 'standard',
        });

        if (type === 'standard') {
            return update;
        } else if (type === 'safe') {
            return {
                ...update,
                'system.wounds.value': Math.min(this.wounds.value + 1, this.wounds.max),
            };
        } else {
            ui.notifications.warn('No rest type selected. Defaulting to standard rest...');
            return update;
        }
    }
}

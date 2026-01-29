import Knave2eActorType from './actor-type.mjs';

export default class Knave2eRecruit extends Knave2eActorType {
    static DEFAULT_CATEGORY = 'hireling';
    static DEFAULT_RARITY = 'KNAVE2E.Common';

    static defineSchema() {
        const fields = foundry.data.fields;
        const requiredInteger = { required: true, nullable: false, integer: true };
        const schema = super.defineSchema();

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
            min: 0,
            max: 7,
        });
        schema.category = new fields.StringField({
            required: true,
            blank: false,
            initial: this.DEFAULT_CATEGORY,
        });
        schema.coins = new fields.NumberField({
            ...requiredInteger,
            initial: 0,
            min: 0,
        });
        schema.costPerMonth = new fields.NumberField({
            ...requiredInteger,
            initial: 300,
            min: 0,
        });
        schema.morale = new fields.NumberField({
            ...requiredInteger,
            initial: 4,
            min: 2,
            max: 12,
        });
        schema.rarity = new fields.StringField({ initial: this.DEFAULT_RARITY });
        schema.spells = new fields.SchemaField({
            value: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
            max: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
        });
        schema.slots = new fields.SchemaField({
            value: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
            max: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 }),
        });

        schema.hitPoints.fields.value.initial = 3;
        schema.hitPoints.fields.max.initial = 3;

        return schema;
    }

    prepareDerivedData() {
        this._deriveHP();
        this._deriveSlots();
    }

    _deriveHP() {
        if (this.hitPoints.value > 0) {
            this.hitPoints.value = Math.min(this.hitPoints.value, this.hitPoints.max);
            this.hitPoints.progress = Math.floor((this.hitPoints.value / this.hitPoints.max) * 100);
        } else {
            this.hitPoints.value = 0;
            this.hitPoints.progress = 0;
        }
    }

    _deriveSlots() {
        const coinsPerSlot = game.settings.get('knave2e', 'coinsPerSlot');
        const arrowsPerSlot = game.settings.get('knave2e', 'arrowsPerSlot');
        const bulletsPerSlot = game.settings.get('knave2e', 'slingBulletsPerSlot');
    
        const coinSlots = coinsPerSlot === 0 ? 0 : this.coins / coinsPerSlot;
        const arrowSlots = arrowsPerSlot === 0 ? 0 : this.ammo.arrow / arrowsPerSlot;
        const bulletSlots = bulletsPerSlot === 0 ? 0 : this.ammo.bullet / bulletsPerSlot;
    
        const sheetSlots = coinSlots + arrowSlots + bulletSlots;
    
        // 1) derive held slots WITHOUT writing to documents
        const { itemSlots, updates: heldUpdates } = this.deriveHeldItemSlots();
    
        const usedSlots = itemSlots + sheetSlots;
    
        if (game.settings.get('knave2e', 'enforceIntegerSlots') === true) {
            this.slots.value = Math.ceil(usedSlots);
            this.slots.max = Math.ceil(this.slots.max);
            } else {
            this.slots.value = Math.round(usedSlots * 100) / 100;
            }
        
            let updates = [...heldUpdates];
        
            // 2) drop or pick up like the character sheet
            if (usedSlots > this.slots.max) {
            updates = updates.concat(this.deriveDroppedItems(usedSlots - this.slots.max));
            } else {
            updates = updates.concat(this.derivePickedUpItems(this.slots.max - usedSlots));
            }
        
            // 3) Apply once, deferred, to prevent prepareDerivedData loops
            this._queueItemSlotUpdates(updates);
        }
        
        deriveHeldItemSlots() {
            const updates = [];
            let itemSlots = 0;
        
            for (const item of this.parent.items.contents) {
            const qty = item.system.quantity ?? 0;
            const slots = item.system.slots ?? 0;
        
            let held = Number.isFinite(item.system.held) ? item.system.held : qty;
            let dropped =
                (typeof item.system.dropped === "boolean") ? item.system.dropped : (held <= 0);
        
            held = Math.max(0, Math.min(held, qty));
            if (dropped) held = 0;
        
            const droppedCount = Math.max(0, qty - held);
            const progress = qty > 0 ? (droppedCount / qty) * 100 : 0;
        
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
                "system.droppedCount": droppedCount,
                "system.progress": progress
                });
            }
        
            itemSlots += held * slots;
            }
        
            return { itemSlots, updates };
        }
        
        deriveDroppedItems(remainder) {
            const updates = [];
            const sortedItems = [...this.parent.items.contents].sort((a, b) => a.sort - b.sort);
        
            for (const item of sortedItems) {
            if (remainder <= 0) break;
        
            const qty = item.system.quantity ?? 0;
            const slots = item.system.slots ?? 0;
        
            let held = Number.isFinite(item.system.held) ? item.system.held : qty;
            let dropped = (typeof item.system.dropped === "boolean") ? item.system.dropped : false;
        
            held = Math.max(0, Math.min(held, qty));
            if (dropped) held = 0;
        
            while (!dropped && remainder > 0 && held > 0) {
                remainder -= slots;
                held -= 1;
                if (held <= 0) dropped = true;
            }
        
            const droppedCount = Math.max(0, qty - held);
            const progress = qty > 0 ? (droppedCount / qty) * 100 : 0;
        
            updates.push({
                _id: item.id,
                "system.held": held,
                "system.dropped": dropped,
                "system.droppedCount": droppedCount,
                "system.progress": progress
            });
            }
        
            return updates;
        }
        
        derivePickedUpItems(freeSlots) {
            const updates = [];
            const sorted = [...this.parent.items.contents].sort((a, b) => a.sort - b.sort);
        
            for (const item of sorted) {
            if (freeSlots <= 0) break;
        
            const qty = item.system.quantity ?? 0;
            const slots = item.system.slots ?? 0;
            if (qty <= 0 || slots <= 0) continue;
        
            let held = Number.isFinite(item.system.held) ? item.system.held : qty;
            held = Math.max(0, Math.min(held, qty));
        
            let dropped = typeof item.system.dropped === "boolean" ? item.system.dropped : false;
        
            while (held < qty && freeSlots >= slots) {
                held += 1;
                freeSlots -= slots;
                dropped = false;
            }
        
            const droppedCount = Math.max(0, qty - held);
            const progress = qty > 0 ? (droppedCount / qty) * 100 : 0;
        
            updates.push({
                _id: item.id,
                "system.held": held,
                "system.dropped": dropped,
                "system.droppedCount": droppedCount,
                "system.progress": progress
            });
            }
        
            return updates;
        }
        
    
        _queueItemSlotUpdates(updates) {
            if (!updates?.length) return;
            
                const map = new Map();
                for (const u of updates) map.set(u._id, u);
                const finalUpdates = [...map.values()];
            
                if (this.parent._knave2eApplyingSlotUpdates) return;
                this.parent._knave2eApplyingSlotUpdates = true;
            
                queueMicrotask(async () => {
                try {
                    if (finalUpdates.length) {
                    await this.parent.updateEmbeddedDocuments("Item", finalUpdates);
                    }
                } finally {
                    this.parent._knave2eApplyingSlotUpdates = false;
                }
                });
            }
}

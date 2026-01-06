
export const Direction = {
    NORTH: 0,
    EAST: 1,
    SOUTH: 2,
    WEST: 3,
    UP: 4,
    DOWN: 5,
    
    // Helpers to get vector from direction
    toVector: (dir) => {
        switch (dir) {
            case 0: return { x: 0, y: -1, z: 0 }; // North (Negative Y in 2D grid usually means Up/North)
            case 1: return { x: 1, y: 0, z: 0 };  // East
            case 2: return { x: 0, y: 1, z: 0 };  // South
            case 3: return { x: -1, y: 0, z: 0 }; // West
            case 4: return { x: 0, y: 0, z: 1 };  // Up (Z+)
            case 5: return { x: 0, y: 0, z: -1 }; // Down (Z-)
            default: return { x: 0, y: 0, z: 0 };
        }
    },

    // Get opposite direction
    opposite: (dir) => {
        switch (dir) {
            case 0: return 2;
            case 1: return 3;
            case 2: return 0;
            case 3: return 1;
            case 4: return 5;
            case 5: return 4;
            default: return dir;
        }
    }
};

export class EntityManager {
    constructor() {
        this.entities = new Map();
        this.nextId = 1;
    }
    
    createEntity() {
        const id = this.nextId++;
        this.entities.set(id, new Map());
        return id;
    }
    
    removeEntity(id) {
        this.entities.delete(id);
    }
    
    addComponent(entityId, componentName, component) {
        if (!this.entities.has(entityId)) return;
        this.entities.get(entityId).set(componentName, component);
    }
    
    removeComponent(entityId, componentName) {
        if (!this.entities.has(entityId)) return;
        this.entities.get(entityId).delete(componentName);
    }
    
    getComponent(entityId, componentName) {
        if (!this.entities.has(entityId)) return null;
        return this.entities.get(entityId).get(componentName);
    }
    
    getEntitiesWithComponent(componentName) {
        const result = [];
        for (const [id, components] of this.entities) {
            if (components.has(componentName)) {
                result.push({ id, components });
            }
        }
        return result;
    }
}

export class Chunk {
    constructor(x, z) {
        this.x = x;
        this.z = z;
        this.blocks = new Map();
        this.scheduledTicks = [];
    }
    
    getBlock(x, y, z) {
        const key = `${x},${y},${z}`;
        return this.blocks.get(key);
    }
    
    setBlock(x, y, z, block) {
        const key = `${x},${y},${z}`;
        this.blocks.set(key, block);
    }
}

export class RedstoneSimulator {
    constructor(width = 64, height = 48) {
        this.width = width;
        this.height = height;
        this.cellSize = 16;
        this.entityManager = new EntityManager();
        this.tickCount = 0;
        this.nextTickList = [];
        
        this.componentRegistry = new Map();
        this.initComponentRegistry();
    }
    
    initComponentRegistry() {
        this.registerComponent('minecraft:redstone_dust', RedstoneDustComponent);
        this.registerComponent('minecraft:redstone_torch', RedstoneTorchComponent);
        this.registerComponent('minecraft:lever', LeverComponent);
        this.registerComponent('minecraft:button', ButtonComponent);
        this.registerComponent('minecraft:repeater', RepeaterComponent);
        this.registerComponent('minecraft:comparator', ComparatorComponent);
        this.registerComponent('minecraft:observer', ObserverComponent);
        this.registerComponent('minecraft:piston', PistonComponent);
        this.registerComponent('minecraft:sticky_piston', StickyPistonComponent);
        this.registerComponent('minecraft:piston_head', PistonHeadComponent);
        this.registerComponent('minecraft:redstone_block', RedstoneBlockComponent);
        this.registerComponent('minecraft:stone', StoneComponent);
    }
    
    registerComponent(type, componentClass) {
        this.componentRegistry.set(type, componentClass);
    }
    
    createEntity(type, x, y) {
        const entityId = this.entityManager.createEntity();
        
        this.entityManager.addComponent(entityId, 'position', { x, y, z: 0 });
        
        if (this.componentRegistry.has(type)) {
            const ComponentClass = this.componentRegistry.get(type);
            const component = new ComponentClass();
            this.entityManager.addComponent(entityId, 'redstone', component);
        }
        
        this.entityManager.addComponent(entityId, 'blockState', {
            type: type,
            rotation: 0,
            powered: false,
            powerLevel: 0,
            waterlogged: false
        });
        
        // Initial update for the new component
        const component = this.entityManager.getComponent(entityId, 'redstone');
        if (component) {
             component.onPlaced(this, x, y);
        }

        return entityId;
    }
    
    tick() {
        this.tickCount++;
        this.processScheduledTicks();
        
        // Note: In a true event-driven system, we don't need a global update loop for redstone.
        // Updates are triggered by interactions or scheduled ticks.
        // However, for inputs (Levers/Buttons) or continuous states, we might check some things.
        // For now, we rely on scheduled ticks and neighbor updates.
    }
    
    processScheduledTicks() {
        // Sort by time, then priority (not implemented here, but Java does it)
        // We just process all ticks that are due.
        const now = this.tickCount; // Use tickCount as time
        
        // Filter ticks that are due
        const dueTicks = this.nextTickList.filter(t => t.time <= now);
        // Remove due ticks from list
        this.nextTickList = this.nextTickList.filter(t => t.time > now);
        
        // Process them
        // To avoid infinite loops in one tick (though delay should prevent that), we iterate a copy
        for (const tick of dueTicks) {
            const entity = this.getBlockEntity(tick.x, tick.y);
            if (entity) {
                const redstone = entity.components.get('redstone');
                if (redstone) {
                    redstone.onScheduledTick(this, tick.x, tick.y, tick.data);
                }
            }
        }
    }
    
    scheduleBlockUpdate(x, y, delay, priority = 0) {
        // delay is in game ticks. 
        this.nextTickList.push({
            x, y,
            time: this.tickCount + delay,
            priority
        });
    }

    getBlockEntity(x, y) {
        // Optimized lookup could be added here (e.g., a 2D array cache)
        // For now, linear search is okay for small grids, but Map is better.
        // The EntityManager is not spatially indexed. 
        // Let's implement a quick spatial lookup helper if needed, 
        // but for <1000 entities, find() is acceptable for this prototype.
        const entities = this.entityManager.getEntitiesWithComponent('position');
        return entities.find(({ components }) => {
            const pos = components.get('position');
            return pos.x === x && pos.y === y;
        });
    }

    // Get power level at x,y coming FROM a specific direction
    // direction is where the power is coming FROM (relative to x,y)
    // So if I am at (x,y) and checking input from North (x, y-1), 
    // I ask the block at (x, y-1) for its weak/strong power output towards South (Direction.SOUTH).
    getPower(x, y, fromDirection) {
        // x,y is the target block. 
        // fromDirection is the direction relative to x,y where the source is.
        // e.g. fromDirection = NORTH means source is at (x, y-1).
        
        const vec = Direction.toVector(fromDirection);
        const sourceX = x + vec.x;
        const sourceY = y + vec.y;
        
        const sourceEntity = this.getBlockEntity(sourceX, sourceY);
        if (!sourceEntity) return 0;
        
        const redstone = sourceEntity.components.get('redstone');
        if (!redstone) {
            // Check if it's a solid block that can conduct power (Strongly powered)
            // For now, assume simple components. 
            // If it's a block, we need to check if IT is powered by something else?
            // "Strong power" vs "Weak power".
            // If the source is a generic block (e.g. Stone), it provides power if it is strongly powered.
            return 0; // Stone doesn't generate power itself
        }
        
        // Ask the source for its output towards the opposite direction
        // (Source is to the North, so it outputs to the South)
        return redstone.getPowerOutput(this, sourceX, sourceY, Direction.opposite(fromDirection));
    }

    // Helper to get strongest power from all neighbors
    getMaxNeighborPower(x, y) {
        let max = 0;
        [Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST].forEach(dir => {
            max = Math.max(max, this.getPower(x, y, dir));
        });
        return max;
    }

    notifyNeighbors(x, y) {
        [Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST].forEach(dir => {
            const vec = Direction.toVector(dir);
            const nx = x + vec.x;
            const ny = y + vec.y;
            const neighbor = this.getBlockEntity(nx, ny);
            if (neighbor) {
                const redstone = neighbor.components.get('redstone');
                if (redstone) {
                    redstone.onNeighborUpdate(this, nx, ny, x, y);
                }
            }
        });
    }

    // Quasi-connectivity check (used by Pistons, Droppers, Dispensers)
    checkQuasiConnectivity(x, y) {
        // Check block above (y-1) and block above-up (y-2, impossible in 2D?)
        // In top-down 2D, let's assume "Up" is not visible, 
        // but maybe we map "Up" to something?
        // Or is this a side-view simulator?
        // User said "redstone circuit designer", usually top down.
        // But QC usually refers to checking 1 block *above* the component.
        // If this is top-down (X, Z in Minecraft terms), QC doesn't apply the same way unless we have layers.
        // Assuming this is a standard top-down 2D redstone sim (like Redstone Simulator on web), 
        // QC might not be relevant or is simulated differently.
        // However, I will leave the hook.
        return false;
    }

    getWidth() { return this.width; }
    getHeight() { return this.height; }
}

// Base Component
class RedstoneComponent {
    constructor() {
        this.powerLevel = 0;
    }

    onPlaced(simulator, x, y) {
        this.onNeighborUpdate(simulator, x, y, x, y);
    }

    onNeighborUpdate(simulator, x, y, neighborX, neighborY) {
        // Default: do nothing
    }

    onScheduledTick(simulator, x, y, data) {
        // Default: do nothing
    }

    // Return power level outputting towards 'toDirection'
    getPowerOutput(simulator, x, y, toDirection) {
        return 0;
    }
    
    // Helper to update visual block state
    updateBlockState(simulator, x, y, changes) {
        const entity = simulator.getBlockEntity(x, y);
        if (entity) {
            const blockState = entity.components.get('blockState');
            Object.assign(blockState, changes);
        }
    }
}

class RedstoneDustComponent extends RedstoneComponent {
    onNeighborUpdate(simulator, x, y, neighborX, neighborY) {
        // Calculate new power level based on neighbors
        let maxPower = 0;
        
        [Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST].forEach(dir => {
            const vec = Direction.toVector(dir);
            const nx = x + vec.x;
            const ny = y + vec.y;
            
            const neighbor = simulator.getBlockEntity(nx, ny);
            if (!neighbor) return;
            
            const redstone = neighbor.components.get('redstone');
            if (redstone) {
                // If neighbor is dust, it provides power - 1
                if (redstone instanceof RedstoneDustComponent) {
                    maxPower = Math.max(maxPower, redstone.powerLevel - 1);
                } 
                // If neighbor is a source (Repeater, Torch, Lever, Block), check its output
                else {
                    maxPower = Math.max(maxPower, redstone.getPowerOutput(simulator, nx, ny, Direction.opposite(dir)));
                }
            }
        });

        if (this.powerLevel !== maxPower) {
            this.powerLevel = maxPower;
            this.updateBlockState(simulator, x, y, { powerLevel: maxPower });
            simulator.notifyNeighbors(x, y);
        }
    }

    getPowerOutput(simulator, x, y, toDirection) {
        // Dust outputs weak power to all sides, and strong power to none (unless we count blocks)
        // For components, we just return the power level.
        return this.powerLevel;
    }
}

class RedstoneTorchComponent extends RedstoneComponent {
    onPlaced(simulator, x, y) {
        // Schedule initial check
        simulator.scheduleBlockUpdate(x, y, 2);
    }

    onNeighborUpdate(simulator, x, y, neighborX, neighborY) {
        // If the block attached to (assuming attached to "ground" or wall?)
        // In 2D top down, torches usually attach to the block "under" them (layer below) or side.
        // Let's assume the torch is on the ground (standing).
        // A standing torch is powered if the block *under* it is powered? 
        // No, a standing torch is powered if the block it is ON is powered.
        // But in 2D top down, we can't see the block below.
        // Usually in 2D sims, torches are attached to a block in a specific direction.
        // Let's assume standard behavior:
        // Check input from the block it is attached to.
        // If we assume it's attached to the block "behind" it relative to rotation?
        // Or simpler: It's a source that is always ON unless powered by a specific neighbor?
        // In standard top-down logic:
        // A torch attached to a block turns OFF if that block is powered.
        // We need 'rotation' to know which block it is attached to.
        
        simulator.scheduleBlockUpdate(x, y, 2); // 2 ticks delay
    }

    onScheduledTick(simulator, x, y, data) {
        const entity = simulator.getBlockEntity(x, y);
        const rotation = entity.components.get('blockState').rotation;
        
        // Determine attached block based on rotation
        // 0: North (Attached to South block? No, usually rotation points TO the torch head)
        // Let's assume rotation points in the direction the torch leans.
        // If rotation is 0 (North), it's attached to the South block.
        // Wait, standard MC: "Facing" is direction it points.
        // Wall Torch Facing North: Attached to South block.
        // Standing Torch: Attached to block below.
        
        // Let's implement Wall Torch logic for 2D:
        let attachedDir = Direction.SOUTH; // Default if facing North
        if (rotation === 0) attachedDir = Direction.SOUTH;
        else if (rotation === 1) attachedDir = Direction.WEST;
        else if (rotation === 2) attachedDir = Direction.NORTH;
        else if (rotation === 3) attachedDir = Direction.EAST;
        
        const vec = Direction.toVector(attachedDir);
        const inputPower = simulator.getPower(x, y, attachedDir); // Check power coming FROM the attached block
        
        const shouldBeOff = inputPower > 0;
        const isOff = this.powerLevel === 0;
        
        if (shouldBeOff && !isOff) {
            this.powerLevel = 0;
            this.updateBlockState(simulator, x, y, { type: 'minecraft:redstone_torch_off' });
            simulator.notifyNeighbors(x, y);
        } else if (!shouldBeOff && isOff) {
            this.powerLevel = 15;
            this.updateBlockState(simulator, x, y, { type: 'minecraft:redstone_torch' });
            simulator.notifyNeighbors(x, y);
        }
    }

    getPowerOutput(simulator, x, y, toDirection) {
        // Torch outputs strong power (15) to all sides EXCEPT the one it is attached to?
        // Standing torch: 15 to all horizontal.
        // Wall torch: 15 to North, East, South (if facing North), but NOT to South (attached block).
        // Actually, wall torch powers the block above (strong) and others (weak).
        // Simplified: Output 15 to all except attached side.
        
        const entity = simulator.getBlockEntity(x, y);
        const rotation = entity.components.get('blockState').rotation;
        let attachedDir = Direction.SOUTH;
        if (rotation === 0) attachedDir = Direction.SOUTH;
        else if (rotation === 1) attachedDir = Direction.WEST;
        else if (rotation === 2) attachedDir = Direction.NORTH;
        else if (rotation === 3) attachedDir = Direction.EAST;

        if (toDirection === attachedDir) return 0; // Don't power the block we are attached to (loop prevention)
        return this.powerLevel;
    }
}

class LeverComponent extends RedstoneComponent {
    constructor() {
        super();
        this.powerLevel = 0; // Starts off
    }

    toggle(simulator, x, y) {
        this.powerLevel = (this.powerLevel > 0) ? 0 : 15;
        this.updateBlockState(simulator, x, y, { powered: this.powerLevel > 0 });
        simulator.notifyNeighbors(x, y);
    }

    getPowerOutput(simulator, x, y, toDirection) {
        return this.powerLevel;
    }
}

class ButtonComponent extends RedstoneComponent {
    constructor() {
        super();
        this.powerLevel = 0;
    }

    press(simulator, x, y) {
        if (this.powerLevel === 0) {
            this.powerLevel = 15;
            this.updateBlockState(simulator, x, y, { powered: true });
            simulator.notifyNeighbors(x, y);
            simulator.scheduleBlockUpdate(x, y, 20); // 10 redstone ticks (1 sec) for Stone Button
        }
    }

    onScheduledTick(simulator, x, y, data) {
        this.powerLevel = 0;
        this.updateBlockState(simulator, x, y, { powered: false });
        simulator.notifyNeighbors(x, y);
    }

    getPowerOutput(simulator, x, y, toDirection) {
        return this.powerLevel;
    }
}

class RepeaterComponent extends RedstoneComponent {
    constructor() {
        super();
        this.delay = 1; // Default 1 redstone tick (2 game ticks)
        this.locked = false;
        this.powered = false;
    }

    onNeighborUpdate(simulator, x, y, neighborX, neighborY) {
        const entity = simulator.getBlockEntity(x, y);
        const rotation = entity.components.get('blockState').rotation;
        
        // Check for locking (Side inputs)
        // Side directions relative to rotation
        // If rotation is 0 (North), sides are West (3) and East (1)
        const leftSide = (rotation + 3) % 4;
        const rightSide = (rotation + 1) % 4;
        
        const powerLeft = this.getRepeaterInput(simulator, x, y, leftSide);
        const powerRight = this.getRepeaterInput(simulator, x, y, rightSide);
        
        const wasLocked = this.locked;
        this.locked = (powerLeft > 0 || powerRight > 0);
        
        if (wasLocked !== this.locked) {
            // Visual update for lock state could be added here
        }

        if (this.locked) return; // If locked, state cannot change

        // Check Rear Input
        // Input comes from opposite of facing.
        // Facing 0 (North) -> Input from South (2)
        const inputDir = (rotation + 2) % 4;
        const inputPower = simulator.getPower(x, y, inputDir);
        
        const shouldBePowered = inputPower > 0;
        
        if (shouldBePowered && !this.powered) {
            // Schedule turn on
            simulator.scheduleBlockUpdate(x, y, this.delay * 2);
        } else if (!shouldBePowered && this.powered) {
            // Schedule turn off
            simulator.scheduleBlockUpdate(x, y, this.delay * 2);
        }
    }
    
    // Helper to check if neighbor is a powered repeater/comparator (for locking)
    getRepeaterInput(simulator, x, y, fromDirection) {
        const vec = Direction.toVector(fromDirection);
        const sourceX = x + vec.x;
        const sourceY = y + vec.y;
        const entity = simulator.getBlockEntity(sourceX, sourceY);
        if (!entity) return 0;
        
        const redstone = entity.components.get('redstone');
        if (!redstone) return 0;
        
        // Only Repeaters and Comparators can lock a repeater
        if (redstone instanceof RepeaterComponent || redstone instanceof ComparatorComponent) {
            return redstone.getPowerOutput(simulator, sourceX, sourceY, Direction.opposite(fromDirection));
        }
        return 0;
    }

    onScheduledTick(simulator, x, y, data) {
        if (this.locked) return;

        const entity = simulator.getBlockEntity(x, y);
        const rotation = entity.components.get('blockState').rotation;
        const inputDir = (rotation + 2) % 4;
        const inputPower = simulator.getPower(x, y, inputDir);
        const shouldBePowered = inputPower > 0;
        
        this.powered = shouldBePowered;
        this.powerLevel = this.powered ? 15 : 0;
        
        const type = this.powered ? 'minecraft:repeater_on' : 'minecraft:repeater';
        this.updateBlockState(simulator, x, y, { type, powered: this.powered });
        
        simulator.notifyNeighbors(x, y);
    }

    getPowerOutput(simulator, x, y, toDirection) {
        // Repeater only outputs to the front (rotation)
        const entity = simulator.getBlockEntity(x, y);
        const rotation = entity.components.get('blockState').rotation;
        
        if (toDirection === rotation) {
            return this.powerLevel;
        }
        return 0;
    }
}

class ComparatorComponent extends RedstoneComponent {
    constructor() {
        super();
        this.mode = 'compare'; // 'compare' or 'subtract'
        this.outputPower = 0;
    }

    onNeighborUpdate(simulator, x, y, neighborX, neighborY) {
        simulator.scheduleBlockUpdate(x, y, 0); // Instant update (or 1 tick in some cases)
    }
    
    onScheduledTick(simulator, x, y, data) {
        const entity = simulator.getBlockEntity(x, y);
        const rotation = entity.components.get('blockState').rotation;
        
        // Rear Input
        const inputDir = (rotation + 2) % 4;
        const rearPower = simulator.getPower(x, y, inputDir);
        
        // Side Inputs
        const leftSide = (rotation + 3) % 4;
        const rightSide = (rotation + 1) % 4;
        const sidePower = Math.max(
            simulator.getPower(x, y, leftSide),
            simulator.getPower(x, y, rightSide)
        );
        
        let newPower = 0;
        
        if (this.mode === 'subtract') {
            newPower = Math.max(0, rearPower - sidePower);
        } else {
            // Compare mode
            if (rearPower >= sidePower) {
                newPower = rearPower;
            } else {
                newPower = 0;
            }
        }
        
        if (this.outputPower !== newPower) {
            this.outputPower = newPower;
            this.powerLevel = newPower; // Used by getPowerOutput
            
            const type = this.outputPower > 0 ? 'minecraft:comparator_on' : 'minecraft:comparator';
            this.updateBlockState(simulator, x, y, { type, powerLevel: this.outputPower });
            
            simulator.notifyNeighbors(x, y);
        }
    }

    getPowerOutput(simulator, x, y, toDirection) {
        const entity = simulator.getBlockEntity(x, y);
        const rotation = entity.components.get('blockState').rotation;
        
        if (toDirection === rotation) {
            return this.outputPower;
        }
        return 0;
    }
}

class ObserverComponent extends RedstoneComponent {
    onNeighborUpdate(simulator, x, y, neighborX, neighborY) {
        const entity = simulator.getBlockEntity(x, y);
        const rotation = entity.components.get('blockState').rotation;
        
        // Observer detects updates at the FACE (rotation)
        const faceDir = rotation; // If facing North, face is North
        const vec = Direction.toVector(faceDir);
        
        // Check if update came from the face block
        if (neighborX === x + vec.x && neighborY === y + vec.y) {
             // Pulse!
             simulator.scheduleBlockUpdate(x, y, 2);
        }
    }
    
    onScheduledTick(simulator, x, y, data) {
        if (this.powerLevel === 0) {
            this.powerLevel = 15;
            this.updateBlockState(simulator, x, y, { type: 'minecraft:observer_on' });
            simulator.notifyNeighbors(x, y);
            simulator.scheduleBlockUpdate(x, y, 2); // Turn off after 2 ticks
        } else {
            this.powerLevel = 0;
            this.updateBlockState(simulator, x, y, { type: 'minecraft:observer' });
            simulator.notifyNeighbors(x, y);
        }
    }

    getPowerOutput(simulator, x, y, toDirection) {
        const entity = simulator.getBlockEntity(x, y);
        const rotation = entity.components.get('blockState').rotation;
        const outputDir = (rotation + 2) % 4; // Back
        
        if (toDirection === outputDir) {
            return this.powerLevel;
        }
        return 0;
    }
}

class PistonComponent extends RedstoneComponent {
    constructor() {
        super();
        this.extended = false;
        this.isSticky = false;
        this.headId = -1;
    }
    
    onNeighborUpdate(simulator, x, y, neighborX, neighborY) {
        // Check if powered
        const maxPower = simulator.getMaxNeighborPower(x, y);
        const qcPower = simulator.checkQuasiConnectivity(x, y); // TODO: Implement QC
        
        const shouldExtend = maxPower > 0 || qcPower;
        
        if (shouldExtend && !this.extended) {
            simulator.scheduleBlockUpdate(x, y, 2); // Delay
        } else if (!shouldExtend && this.extended) {
            simulator.scheduleBlockUpdate(x, y, 2);
        }
    }
    
    onScheduledTick(simulator, x, y, data) {
        const maxPower = simulator.getMaxNeighborPower(x, y);
        const shouldExtend = maxPower > 0; // Re-check
        
        if (shouldExtend && !this.extended) {
            this.extend(simulator, x, y);
        } else if (!shouldExtend && this.extended) {
            this.retract(simulator, x, y);
        }
    }
    
    extend(simulator, x, y) {
        if (this.extended) return;
        
        const entity = simulator.getBlockEntity(x, y);
        const rotation = entity.components.get('blockState').rotation;
        
        const pushDir = rotation;
        const vec = Direction.toVector(pushDir);
        
        // Check blocks in front
        if (this.canPush(simulator, x, y, pushDir)) {
            this.doPush(simulator, x, y, pushDir);
            this.extended = true;
            this.updateBlockState(simulator, x, y, { extended: true });
            
            // Create Piston Head
            const headX = x + vec.x;
            const headY = y + vec.y;
            // Remove any existing entity at head pos (should be empty due to push, but safety first)
            const existing = simulator.getBlockEntity(headX, headY);
            if (existing) simulator.entityManager.removeEntity(existing.id);

            const headId = simulator.createEntity('minecraft:piston_head', headX, headY);
            
            const headEntity = simulator.entityManager.entities.get(headId);
            const headComp = headEntity.get('redstone');
            headComp.sourcePistonId = entity.id;
            headComp.isSticky = this.isSticky;
            
            const headState = headEntity.get('blockState');
            headState.rotation = rotation;
            headState.isSticky = this.isSticky; // Store sticky state for renderer
            
            this.headId = headId;
            
            simulator.notifyNeighbors(headX, headY);
        }
    }
    
    retract(simulator, x, y) {
        if (!this.extended) return;
        
        const entity = simulator.getBlockEntity(x, y);
        const rotation = entity.components.get('blockState').rotation;
        const pushDir = rotation;
        
        this.extended = false;
        this.updateBlockState(simulator, x, y, { extended: false });
        
        // Remove Head
        if (this.headId !== -1) {
            simulator.entityManager.removeEntity(this.headId);
            this.headId = -1;
            
            const vec = Direction.toVector(pushDir);
            simulator.notifyNeighbors(x + vec.x, y + vec.y);
        }
        
        if (this.isSticky) {
            this.doPull(simulator, x, y, pushDir);
        }
    }

    canPush(simulator, x, y, direction) {
        const vec = Direction.toVector(direction);
        let cx = x + vec.x;
        let cy = y + vec.y;
        let count = 0;
        
        while (true) {
            const block = simulator.getBlockEntity(cx, cy);
            if (!block) {
                // Empty space, we can push
                return true;
            }
            
            // Check if block is immovable
            const type = block.components.get('blockState').type;
            if (type === 'minecraft:obsidian' || type === 'minecraft:bedrock' || type === 'minecraft:piston_head') {
                return false;
            }
            
            // Extended pistons are immovable
            if ((type === 'minecraft:piston' || type === 'minecraft:sticky_piston') && block.components.get('blockState').extended) {
                return false;
            }
            
            count++;
            if (count >= 12) return false; // Push limit
            
            cx += vec.x;
            cy += vec.y;
        }
    }

    doPush(simulator, x, y, direction) {
        const vec = Direction.toVector(direction);
        
        // Find the end of the stack
        let cx = x + vec.x;
        let cy = y + vec.y;
        const stack = [];
        
        while (true) {
            const block = simulator.getBlockEntity(cx, cy);
            if (!block) break;
            stack.push({ id: block.id, x: cx, y: cy });
            cx += vec.x;
            cy += vec.y;
        }
        
        // Move blocks from end to start (reverse order) to avoid overwriting
        for (let i = stack.length - 1; i >= 0; i--) {
            const item = stack[i];
            const newX = item.x + vec.x;
            const newY = item.y + vec.y;
            
            const entity = simulator.entityManager.entities.get(item.id);
            const pos = entity.get('position');
            pos.x = newX;
            pos.y = newY;
            
            // Notify neighbors of change
            simulator.notifyNeighbors(item.x, item.y);
            simulator.notifyNeighbors(newX, newY);
            
            // Update redstone component if it exists (position changed)
            const redstone = entity.get('redstone');
            if (redstone) {
                // Ideally, we'd trigger an update, but moving might just be position change
            }
        }
    }
    
    doPull(simulator, x, y, direction) {
        const vec = Direction.toVector(direction);
        // The head was at x+dx. It is now gone (retracted).
        // The block to pull is at x+2dx.
        const targetX = x + vec.x * 2;
        const targetY = y + vec.y * 2;
        
        const block = simulator.getBlockEntity(targetX, targetY);
        if (block) {
            const type = block.components.get('blockState').type;
            // Some blocks can't be pulled (obsidian, etc)
             if (type === 'minecraft:obsidian' || type === 'minecraft:bedrock' || type === 'minecraft:piston_head') return;
             
             // Extended pistons cannot be pulled
             if ((type === 'minecraft:piston' || type === 'minecraft:sticky_piston') && block.components.get('blockState').extended) return;

            const destX = x + vec.x;
            const destY = y + vec.y;
            
            // Move it
            const pos = block.components.get('position');
            pos.x = destX;
            pos.y = destY;
            
            simulator.notifyNeighbors(targetX, targetY);
            simulator.notifyNeighbors(destX, destY);
        }
    }
}

class StickyPistonComponent extends PistonComponent {
    constructor() {
        super();
        this.isSticky = true;
    }
}

class PistonHeadComponent extends RedstoneComponent {
    constructor() {
        super();
        this.sourcePistonId = -1;
        this.isSticky = false;
    }
}

class RedstoneBlockComponent extends RedstoneComponent {
    constructor() {
        super();
        this.powerLevel = 15;
    }
    
    getPowerOutput(simulator, x, y, toDirection) {
        return 15;
    }
}

class StoneComponent extends RedstoneComponent {
    // Stone conducts power if strongly powered?
    // In this simple model, components return their power output.
    // If we want Stone to transmit power (Strong -> Weak), we need to track input power.
    // For now, Stone is inert.
}

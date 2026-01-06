export class InputManager {
    constructor(canvas, simulator, renderer) {
        this.canvas = canvas;
        this.simulator = simulator;
        this.renderer = renderer;
        this.selectedComponent = 'minecraft:redstone_dust';
        this.isMouseDown = false;
        this.lastX = -1;
        this.lastY = -1;
        this.mouseX = 0;
        this.mouseY = 0;
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('contextmenu', (e) => this.handleRightClick(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Touch support for mobile
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    }
    
    handleKeyDown(e) {
        if (e.key.toLowerCase() === 'r') {
            e.preventDefault();
            const pos = this.getGridPosition(this.mouseX, this.mouseY);
            this.rotateComponent(pos.x, pos.y);
        }
    }
    
    handleWheel(e) {
        e.preventDefault();
        if (this.renderer) {
            this.renderer.handleZoom(e.deltaY, e.clientX, e.clientY);
        }
    }

    setSelectedComponent(component) {
        // Convert legacy component names to new format
        const componentMap = {
            'redstone_dust': 'minecraft:redstone_dust',
            'redstone_torch': 'minecraft:redstone_torch',
            'lever': 'minecraft:lever',
            'button': 'minecraft:button',
            'repeater': 'minecraft:repeater',
            'comparator': 'minecraft:comparator',
            'piston': 'minecraft:piston',
            'sticky_piston': 'minecraft:sticky_piston',
            'observer': 'minecraft:observer',
            'redstone_block': 'minecraft:redstone_block',
            'stone': 'minecraft:stone'
        };
        
        this.selectedComponent = componentMap[component] || component;
    }
    
    getGridPosition(clientX, clientY) {
        if (this.renderer) {
            return this.renderer.getGridPosition(clientX, clientY);
        }
        // Fallback if renderer is not available
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((clientX - rect.left) / 16);
        const y = Math.floor((clientY - rect.top) / 16);
        return { x, y };
    }
    
    handleMouseDown(e) {
        const pos = this.getGridPosition(e.clientX, e.clientY);
        this.isMouseDown = true;
        this.lastX = pos.x;
        this.lastY = pos.y;
        
        if (e.button === 0) { // Left click
            this.placeOrInteract(pos.x, pos.y);
        }
    }
    
    handleMouseMove(e) {
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;

        if (!this.isMouseDown) return;
        
        const pos = this.getGridPosition(e.clientX, e.clientY);
        if (pos.x !== this.lastX || pos.y !== this.lastY) {
            this.lastX = pos.x;
            this.lastY = pos.y;
            this.placeOrInteract(pos.x, pos.y);
        }
    }
    
    handleMouseUp() {
        this.isMouseDown = false;
    }
    
    handleRightClick(e) {
        e.preventDefault();
        const pos = this.getGridPosition(e.clientX, e.clientY);
        this.showContextMenu(pos.x, pos.y, e.clientX, e.clientY);
    }
    
    showContextMenu(x, y, clientX, clientY) {
        const menu = document.getElementById('context-menu');
        menu.innerHTML = '';
        menu.style.display = 'block';
        menu.style.left = `${clientX}px`;
        menu.style.top = `${clientY}px`;

        const entity = this.simulator.getBlockEntity(x, y);
        
        if (!entity) {
             // Maybe add "Paste" here later
             this.addMenuItem(menu, 'Cancel', () => this.hideContextMenu());
             return;
        }

        const blockState = entity.components.get('blockState');
        const type = blockState.type;

        // Common actions
        this.addMenuItem(menu, 'Rotate', () => {
            this.rotateComponent(x, y);
            this.hideContextMenu();
        });

        // Component specific actions
        if (type.includes('repeater')) {
            const redstone = entity.components.get('redstone');
            this.addMenuSeparator(menu);
            this.addMenuItem(menu, `Delay: ${redstone.delay} ticks`, () => {
                redstone.delay = (redstone.delay % 4) + 1;
                redstone.onScheduledTick(this.simulator, x, y);
                this.hideContextMenu();
            });
        } else if (type.includes('comparator')) {
            const redstone = entity.components.get('redstone');
            this.addMenuSeparator(menu);
            this.addMenuItem(menu, `Mode: ${redstone.mode}`, () => {
                redstone.mode = (redstone.mode === 'compare') ? 'subtract' : 'compare';
                redstone.onScheduledTick(this.simulator, x, y);
                this.hideContextMenu();
            });
        }

        this.addMenuSeparator(menu);
        this.addMenuItem(menu, 'Delete', () => {
             this.simulator.entityManager.removeEntity(entity.id);
             this.simulator.notifyNeighbors(x, y);
             this.hideContextMenu();
        });

        // Close on outside click (handled by document listener, but let's add one here just in case)
        const closeHandler = (e) => {
            if (!menu.contains(e.target)) {
                this.hideContextMenu();
                document.removeEventListener('mousedown', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
    }

    hideContextMenu() {
        const menu = document.getElementById('context-menu');
        menu.style.display = 'none';
    }

    addMenuItem(menu, text, onClick) {
        const item = document.createElement('div');
        item.className = 'menu-item';
        item.textContent = text;
        item.addEventListener('click', onClick);
        menu.appendChild(item);
    }

    addMenuSeparator(menu) {
        const sep = document.createElement('div');
        sep.className = 'menu-separator';
        menu.appendChild(sep);
    }

    rotateComponent(x, y) {
        const entity = this.simulator.getBlockEntity(x, y);
        if (entity) {
            const blockState = entity.components.get('blockState');
            
            // Prevent rotating extended pistons to avoid detachment of head
            if ((blockState.type === 'minecraft:piston' || blockState.type === 'minecraft:sticky_piston') && blockState.extended) {
                return;
            }

            if (blockState) {
                blockState.rotation = (blockState.rotation + 1) % 4;
                const redstone = entity.components.get('redstone');
                if (redstone) {
                    redstone.onNeighborUpdate(this.simulator, x, y, x, y);
                }
                this.simulator.notifyNeighbors(x, y);
            }
        }
    }
    
    rotateOrConfigure(x, y) {
        // Deprecated in favor of context menu, but kept for fallback logic if needed
        this.rotateComponent(x, y);
    }

    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const pos = this.getGridPosition(touch.clientX, touch.clientY);
        // Long press for context menu? For now just place.
        this.placeOrInteract(pos.x, pos.y);
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const pos = this.getGridPosition(touch.clientX, touch.clientY);
        this.placeOrInteract(pos.x, pos.y);
    }
    
    handleTouchEnd(e) {
        if (e) e.preventDefault();
        this.isMouseDown = false;
    }
    
    placeOrInteract(x, y) {
        if (x < 0 || x >= this.simulator.width || y < 0 || y >= this.simulator.height) return;
        
        const existingEntity = this.simulator.getBlockEntity(x, y);
        
        if (this.selectedComponent === 'erase') {
            if (existingEntity) {
                this.simulator.entityManager.removeEntity(existingEntity.id);
                // Notify neighbors that a block was removed
                this.simulator.notifyNeighbors(x, y);
            }
        } else if (!existingEntity) {
            // Place new component
            this.simulator.createEntity(this.selectedComponent, x, y);
            // Neighbor notification is handled in createEntity -> onPlaced
        } else if (existingEntity) {
            // Interact
            const blockState = existingEntity.components.get('blockState');
            const redstone = existingEntity.components.get('redstone');
            
            if (blockState && redstone) {
                if (blockState.type === 'minecraft:lever') {
                    redstone.toggle(this.simulator, x, y);
                } else if (blockState.type === 'minecraft:button') {
                    redstone.press(this.simulator, x, y);
                }
                // Repeater and Comparator configuration moved to Context Menu (Right Click)
            }
        }
    }
    
}

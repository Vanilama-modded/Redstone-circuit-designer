/**
 * TextureManager - Simple local texture loader
 */
class TextureManager {
  constructor(basePath = './textures/block/') {
    this.basePath = basePath;
    this.cache = new Map(); // key -> Image
    this.loading = new Map(); // key -> Promise

    // Explicit mapping for known components to specific file names
    this.textureMapping = {
      'minecraft:redstone_dust': 'redstone_dust_dot.png',
      'minecraft:redstone_dust_line0': 'redstone_dust_line0.png',
      'minecraft:redstone_dust_line1': 'redstone_dust_line1.png',
      'minecraft:redstone_dust_overlay': 'redstone_dust_overlay.png',
      'minecraft:redstone_torch': 'redstone_torch.png',
      'minecraft:redstone_torch_off': 'redstone_torch_off.png',
      'minecraft:lever': 'lever.png',
      'minecraft:button': 'stone.png',
      'minecraft:repeater': 'repeater.png',
      'minecraft:repeater_on': 'repeater_on.png',
      'minecraft:comparator': 'comparator.png',
      'minecraft:comparator_on': 'comparator_on.png',
      'minecraft:piston': 'piston_top.png',
      'minecraft:sticky_piston': 'piston_top_sticky.png',
      'minecraft:piston_inner': 'piston_inner.png',
      'minecraft:observer': 'observer_top.png',
      'minecraft:observer_on': 'observer_top.png',
      'minecraft:redstone_block': 'redstone_block.png',
      'minecraft:stone': 'stone.png',
      'minecraft:piston_head': 'piston_top.png'
    };
    
    // Preload map for redstone logic
    this.redstoneDustTextures = {
        dot: null,
        line0: null,
        line1: null,
        overlay: null
    };
  }

  // Load a texture from local path
  async load(key, options = {}) {
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.loading.has(key)) return this.loading.get(key);

    const filename = this.textureMapping[key];
    if (!filename) {
        console.warn(`No texture mapping for ${key}`);
        return this._createPlaceholder();
    }

    const url = this.basePath + filename;

    const promise = this._loadImage(url)
      .then(img => {
        this.cache.set(key, img);
        this.loading.delete(key);
        return img;
      })
      .catch(err => {
        console.error(`Failed to load texture: ${key} (${url})`, err);
        this.loading.delete(key);
        const placeholder = this._createPlaceholder();
        this.cache.set(key, placeholder);
        return placeholder;
      });

    this.loading.set(key, promise);
    return promise;
  }

  _loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = url;
    });
  }

  _createPlaceholder() {
    const size = 16;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff00ff'; // Magenta
    ctx.fillRect(0, 0, size, size);
    const img = new Image();
    img.src = canvas.toDataURL();
    return img;
  }
}

export class Renderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.ctx.imageSmoothingEnabled = false; // Pixel art style
        this.cellSize = 16;
        this.cameraX = 0;
        this.cameraY = 0;
        this.gridColor = '#333333';
        this.poweredColor = '#ff4444';
        this.loadedTextures = new Map();
        this.redstoneCache = new Map(); // Cache for tinted textures: power -> { dot, line0, line1 }
        this.debugMode = false;
        this.showQuasiConnectivity = true;

        // instantiate texture manager (local)
        this.textureManager = new TextureManager('./textures/block/');

        // Preload a small core set to improve first-render
        this._preloadCoreTextures([
          'minecraft:redstone_dust',
          'minecraft:redstone_dust_line0',
          'minecraft:redstone_dust_line1',
          'minecraft:redstone_torch',
          'minecraft:redstone_torch_off',
          'minecraft:lever',
          'minecraft:button',
          'minecraft:repeater',
          'minecraft:repeater_on',
          'minecraft:comparator',
          'minecraft:comparator_on',
          'minecraft:piston',
          'minecraft:sticky_piston',
          'minecraft:observer',
          'minecraft:observer_on',
          'minecraft:redstone_block',
          'minecraft:stone'
        ]);
    }

    handleZoom(delta, mouseX, mouseY) {
        const zoomSpeed = 1.1;
        const oldSize = this.cellSize;
        
        let newSize;
        if (delta < 0) { // Zoom in
            newSize = oldSize * zoomSpeed;
        } else { // Zoom out
            newSize = oldSize / zoomSpeed;
        }
        
        newSize = Math.max(4, Math.min(64, newSize)); // Clamp
        
        if (newSize !== oldSize) {
            const rect = this.canvas.getBoundingClientRect();
            const mouseCanvasX = mouseX - rect.left;
            const mouseCanvasY = mouseY - rect.top;

            // World coordinates of the mouse before zoom
            const worldX = (mouseCanvasX - this.cameraX) / oldSize;
            const worldY = (mouseCanvasY - this.cameraY) / oldSize;

            this.cellSize = newSize;

            // New camera position to keep the world coordinates at the same screen position
            this.cameraX = mouseCanvasX - worldX * newSize;
            this.cameraY = mouseCanvasY - worldY * newSize;

            this.redstoneCache.clear();
        }
    }

    getGridPosition(clientX, clientY) {
         const rect = this.canvas.getBoundingClientRect();
         const x = Math.floor((clientX - rect.left - this.cameraX) / this.cellSize);
         const y = Math.floor((clientY - rect.top - this.cameraY) / this.cellSize);
         return { x, y };
    }

    async _preloadCoreTextures(list) {
      // fire-and-forget: load textures and cache into loadedTextures map
      await Promise.all(list.map(async (k) => {
          const img = await this.textureManager.load(k);
          this.loadedTextures.set(k, img);
      }));
    }

    setViewport(width, height) {
        this.viewportWidth = width;
        this.viewportHeight = height;
    }

    render(simulator) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const entities = simulator.entityManager.getEntitiesWithComponent('position');
        const width = simulator.getWidth();
        const height = simulator.getHeight();

        // Use camera position for offset
        const offsetX = this.cameraX;
        const offsetY = this.cameraY;

        // Draw grid
        this.drawGrid(width, height, offsetX, offsetY);

        // Draw entities (non-blocking: textures may still be loading)
        entities.forEach(({ id, components }) => {
            const position = components.get('position');
            const blockState = components.get('blockState');
            const redstone = components.get('redstone');

            if (position && blockState) {
                this.drawEntity(
                    position.x,
                    position.y,
                    blockState,
                    redstone,
                    offsetX,
                    offsetY,
                    simulator
                );
            }
        });

        // Draw debug overlays
        if (this.debugMode) {
            this.drawDebugOverlays(simulator, offsetX, offsetY);
        }
    }

    drawRedstoneDust(px, py, blockState, redstone, x, y, simulator) {
        const power = redstone ? redstone.powerLevel : 0;
        
        // Ensure we have tinted textures for this power level
        const cached = this.getTintedRedstoneTextures(power);
        if (!cached) {
            // If base textures aren't loaded yet, try to load them and return (will render next frame)
            this.textureManager.load('minecraft:redstone_dust');
            this.textureManager.load('minecraft:redstone_dust_line0');
            this.textureManager.load('minecraft:redstone_dust_line1');
            return;
        }

        const connections = this.getRedstoneConnections(simulator, x, y);
        const { north, south, east, west } = connections;
        
        // Determine if we are just a dot (no connections)
        const isDot = !north && !south && !east && !west;

        this.ctx.save();
        this.ctx.translate(px + this.cellSize / 2, py + this.cellSize / 2);

        // Always draw the dot as the base (fills the center)
        this.ctx.drawImage(cached.dot, -this.cellSize/2, -this.cellSize/2, this.cellSize, this.cellSize);

        if (!isDot) {
             const halfSize = this.cellSize / 2;
             
             // Draw connections using the cached oriented textures
             // North: Top half of Vertical texture
             if (north) {
                 this.ctx.drawImage(
                     cached.vertical, 
                     0, 0, this.cellSize, halfSize, // Source: Top Half
                     -halfSize, -halfSize, this.cellSize, halfSize // Dest: Top Half
                 );
             }
             
             // South: Bottom half of Vertical texture
             if (south) {
                 this.ctx.drawImage(
                     cached.vertical, 
                     0, halfSize, this.cellSize, halfSize, // Source: Bottom Half
                     -halfSize, 0, this.cellSize, halfSize // Dest: Bottom Half
                 );
             }
             
             // West: Left half of Horizontal texture
             if (west) {
                 this.ctx.drawImage(
                     cached.horizontal, 
                     0, 0, halfSize, this.cellSize, // Source: Left Half
                     -halfSize, -halfSize, halfSize, this.cellSize // Dest: Left Half
                 );
             }
             
             // East: Right half of Horizontal texture
             if (east) {
                 this.ctx.drawImage(
                     cached.horizontal, 
                     halfSize, 0, halfSize, this.cellSize, // Source: Right Half
                     0, -halfSize, halfSize, this.cellSize // Dest: Right Half
                 );
             }
        }

        this.ctx.restore();
        
        // Debug power level
        if (this.debugMode) {
             this.ctx.fillStyle = '#fff';
             this.ctx.fillText(power, px + this.cellSize/2, py + this.cellSize/2);
        }
    }

    getTextureOrientation(img) {
        if (!img) return 'vertical'; // Default assumption
        if (img.orientation) return img.orientation;
        
        try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            const data = ctx.getImageData(0, 0, img.width, img.height).data;
            
            // Check center row vs center col
            const midX = Math.floor(img.width / 2);
            const midY = Math.floor(img.height / 2);
            
            let verticalScore = 0;
            let horizontalScore = 0;
            
            // Sum alpha along center column
            for (let y = 0; y < img.height; y++) {
                const i = (y * img.width + midX) * 4;
                verticalScore += data[i + 3];
            }
            
            // Sum alpha along center row
            for (let x = 0; x < img.width; x++) {
                const i = (midY * img.width + x) * 4;
                horizontalScore += data[i + 3];
            }
            
            // Bias towards vertical if close, as that's standard
            img.orientation = (horizontalScore > verticalScore * 1.2) ? 'horizontal' : 'vertical';
            return img.orientation;
        } catch (e) {
            console.warn('Failed to detect texture orientation', e);
            return 'vertical';
        }
    }

    rotateImage(img, angle) {
        const canvas = document.createElement('canvas');
        canvas.width = this.cellSize;
        canvas.height = this.cellSize;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false; // Keep rotated textures sharp
        ctx.translate(this.cellSize/2, this.cellSize/2);
        ctx.rotate(angle);
        ctx.drawImage(img, -this.cellSize/2, -this.cellSize/2, this.cellSize, this.cellSize);
        const newImg = new Image();
        newImg.src = canvas.toDataURL();
        return newImg;
    }

    getTintedRedstoneTextures(power) {
        if (this.redstoneCache.has(power)) {
            return this.redstoneCache.get(power);
        }

        // Check if base textures are loaded
        const dotImg = this.loadedTextures.get('minecraft:redstone_dust');
        const line0Img = this.loadedTextures.get('minecraft:redstone_dust_line0');
        const line1Img = this.loadedTextures.get('minecraft:redstone_dust_line1');
        
        if (!dotImg || !line0Img) return null;

        const color = this.getRedstoneColor(power);
        const tintedDot = this.tintTexture(dotImg, color);
        
        // Prepare Oriented Textures
        // Determine orientation of line0
        const orientation = this.getTextureOrientation(line0Img);
        
        let tintedVertical;
        let tintedHorizontal;
        
        const tintedLine0 = this.tintTexture(line0Img, color);
        const tintedLine1 = line1Img ? this.tintTexture(line1Img, color) : null;
        
        if (orientation === 'vertical') {
            tintedVertical = tintedLine0;
            // If line1 exists, assume it is horizontal (or check its orientation?)
            // For simplicity, if line1 exists we use it as horizontal.
            // Otherwise rotate line0.
            if (tintedLine1) {
                tintedHorizontal = tintedLine1;
            } else {
                tintedHorizontal = this.rotateImage(tintedLine0, Math.PI / 2);
            }
        } else {
            // line0 is horizontal
            tintedHorizontal = tintedLine0;
            if (tintedLine1) {
                tintedVertical = tintedLine1;
            } else {
                tintedVertical = this.rotateImage(tintedLine0, Math.PI / 2);
            }
        }
        
        const result = { dot: tintedDot, vertical: tintedVertical, horizontal: tintedHorizontal };
        this.redstoneCache.set(power, result);
        return result;
    }

    tintTexture(image, color) {
        const canvas = document.createElement('canvas');
        canvas.width = this.cellSize; // Use cell size (16)
        canvas.height = this.cellSize;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false; // Keep tinted textures sharp
        
        // Draw image scaled to cell size
        ctx.drawImage(image, 0, 0, this.cellSize, this.cellSize);
        
        // Apply tint
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, this.cellSize, this.cellSize);
        
        // Create new image from canvas
        const newImg = new Image();
        newImg.src = canvas.toDataURL();
        return newImg;
    }

    getRedstoneColor(power) {
        // Power 0 to 15
        // 0: Dark Red (roughly #4b0000 or #600000)
        // 15: Bright Red (#ff0000)
        // Interpolate
        const min = 80;
        const max = 255;
        const val = Math.floor(min + (max - min) * (power / 15));
        return `rgb(${val}, 0, 0)`;
    }

    getRedstoneConnections(simulator, x, y) {
        const check = (dx, dy, dir) => {
            const nx = x + dx;
            const ny = y + dy;
            const neighbor = simulator.getBlockEntity(nx, ny);
            if (!neighbor) return false;
            
            const blockState = neighbor.components.get('blockState');
            if (!blockState) return false;
            const type = blockState.type;
            
            // 1. Connect to other Redstone Dust
            if (type === 'minecraft:redstone_dust') return true;

            // 2. Connect to Redstone Block
            if (type === 'minecraft:redstone_block') return true;

            // 3. Connect to specific components based on their orientation
            if (type.includes('repeater') || type.includes('comparator')) {
                // Connect only to the Front (Input) or Back (Output)
                // Repeater facing North (0): Input from South (2), Output to North (0)
                // So if we are South of it (dy=+1), we connect to its Input.
                // If we are North of it (dy=-1), we connect to its Output.
                // We are at (x,y). Neighbor is at (x+dx, y+dy).
                // "dir" is the direction FROM us TO neighbor.
                // e.g. check(0, -1, NORTH): Neighbor is North.
                // If Neighbor is Repeater Facing North (0):
                // It outputs North. We are South of it? No, we are South of the neighbor relative to the neighbor?
                // Neighbor is at (0, -1). We are at (0, 0). We are South of the neighbor.
                // Neighbor outputs North. So it outputs AWAY from us. We don't connect?
                // Wait.
                // Repeater (at 0,-1) Facing North (0).
                // Output is at (0, -2). Input is at (0, 0).
                // We are at (0, 0). So we are at the Input.
                // So we connect.
                
                const rot = blockState.rotation || 0;
                
                // If neighbor is facing TOWARDS us, we connect (Output)
                // Neighbor pos: (nx, ny). Facing: rot.
                // Output pos: (nx + vec(rot).x, ny + vec(rot).y)
                // If Output pos == (x, y), then it faces us.
                
                // If neighbor is facing AWAY from us, we connect (Input)
                // Input pos: (nx - vec(rot).x, ny - vec(rot).y) -> actually (nx + vec(rot+2).x...)
                // If Input pos == (x, y), then we are at its input.
                
                const vec = this.getDirectionVector(rot);
                // Check if we are at Output
                if (nx + vec.x === x && ny + vec.y === y) return true;
                
                // Check if we are at Input (Back)
                const backVec = this.getDirectionVector((rot + 2) % 4);
                if (nx + backVec.x === x && ny + backVec.y === y) return true;
                
                return false;
            }

            if (type.includes('observer')) {
                // Observer Output is at the Back.
                // If we are at the Back, we connect.
                const rot = blockState.rotation || 0;
                // Facing is Input (Face). Back is Output.
                const backVec = this.getDirectionVector((rot + 2) % 4);
                if (nx + backVec.x === x && ny + backVec.y === y) return true;
                return false;
            }
            
            // 4. Connect to Inputs/Outputs (Levers, Buttons, Pistons, Lamps, Torches)
            // Most of these connect on all sides (or at least visual dust connects to them)
            // Stone does not connect.
            if (type === 'minecraft:stone') return false;
            
            // Pistons connect on all sides? 
            // In Java, dust connects to Piston (it can power it).
            if (type.includes('piston')) return true;
            
            // Levers/Buttons connect
            if (type === 'minecraft:lever' || type === 'minecraft:button') return true;
            
            // Torches
            if (type.includes('torch')) return true;

            // Generic fallback: if it has redstone component, connect (unless excluded above)
            if (neighbor.components.has('redstone')) return true;
            
            return false;
        };

        return {
            north: check(0, -1, 0),
            south: check(0, 1, 2),
            west: check(-1, 0, 3),
            east: check(1, 0, 1)
        };
    }

    getDirectionVector(dir) {
        switch (dir) {
            case 0: return { x: 0, y: -1 }; // North
            case 1: return { x: 1, y: 0 };  // East
            case 2: return { x: 0, y: 1 };  // South
            case 3: return { x: -1, y: 0 }; // West
            default: return { x: 0, y: 0 };
        }
    }

    drawGrid(width, height, offsetX, offsetY) {
        this.ctx.strokeStyle = this.gridColor;
        this.ctx.lineWidth = 1;

        for (let x = 0; x <= width; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(offsetX + x * this.cellSize, offsetY);
            this.ctx.lineTo(offsetX + x * this.cellSize, offsetY + height * this.cellSize);
            this.ctx.stroke();
        }

        for (let y = 0; y <= height; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(offsetX, offsetY + y * this.cellSize);
            this.ctx.lineTo(offsetX + width * this.cellSize, offsetY + y * this.cellSize);
            this.ctx.stroke();
        }
    }

    drawEntity(x, y, blockState, redstone, offsetX, offsetY, simulator) {
        const px = offsetX + x * this.cellSize;
        const py = offsetY + y * this.cellSize;
        const type = blockState.type;

        if (type === 'minecraft:redstone_dust') {
            this.drawRedstoneDust(px, py, blockState, redstone, x, y, simulator);
            return;
        }

        if (type === 'minecraft:button') {
            this.drawButton(px, py, blockState, redstone);
            return;
        }

        let textureKey = type;
        if (type.includes('torch') && (!redstone || !redstone.isPowered)) {
            textureKey = 'minecraft:redstone_torch_off';
        } else if (type.includes('repeater') && redstone && redstone.isPowered) {
            textureKey = 'minecraft:repeater_on';
        } else if (type.includes('comparator') && redstone && redstone.isPowered) {
            textureKey = 'minecraft:comparator_on';
        } else if (type.includes('observer') && redstone && redstone.isPowered) {
            textureKey = 'minecraft:observer_on';
        }

        const texture = this.loadedTextures.get(textureKey);
        if (texture) {
            this.ctx.save();
            this.ctx.translate(px + this.cellSize / 2, py + this.cellSize / 2);
            
            const rotation = blockState.rotation || 0;
            this.ctx.rotate(rotation * Math.PI / 2);

            if (type.includes('piston') && blockState.extended) {
                // Draw piston base (inner part)
                const innerTexture = this.loadedTextures.get('minecraft:piston_inner');
                if (innerTexture) {
                    this.ctx.drawImage(innerTexture, -this.cellSize / 2, -this.cellSize / 2, this.cellSize, this.cellSize);
                }
            } else {
                this.ctx.drawImage(texture, -this.cellSize / 2, -this.cellSize / 2, this.cellSize, this.cellSize);
            }
            
            this.ctx.restore();
        } else {
            // Fallback for loading textures
            this.textureManager.load(textureKey).then(img => {
                this.loadedTextures.set(textureKey, img);
            });
        }
    }

    drawButton(px, py, blockState, redstone) {
        const stoneTexture = this.loadedTextures.get('minecraft:stone');
        if (!stoneTexture) {
            this.textureManager.load('minecraft:stone').then(img => this.loadedTextures.set('minecraft:stone', img));
            return;
        }

        // Draw the button shape
        const buttonWidth = (6 / 16) * this.cellSize;
        const buttonHeight = (4 / 16) * this.cellSize;
        const buttonX = px + (this.cellSize - buttonWidth) / 2;
        const buttonY = py + (this.cellSize - buttonHeight) / 2;

        // Draw the button using the stone texture (center crop)
        const texWidth = stoneTexture.width;
        const texHeight = stoneTexture.height;
        const sW = (6 / 16) * texWidth;
        const sH = (4 / 16) * texHeight;
        const sX = (texWidth - sW) / 2;
        const sY = (texHeight - sH) / 2;

        this.ctx.drawImage(stoneTexture, sX, sY, sW, sH, buttonX, buttonY, buttonWidth, buttonHeight);

        // Visual feedback for pressed state (darker overlay)
        if (redstone && redstone.isPowered) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
        }

        // Add a border to make it look raised/distinct
        this.ctx.strokeStyle = '#666666';
        this.ctx.lineWidth = Math.max(1, this.cellSize / 16);
        this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
    }
}

import { RedstoneSimulator } from './simulator.js';
import { Renderer } from './renderer.js';
import { InputManager } from './input.js';

class RedstoneCircuitDesigner {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.simulator = new RedstoneSimulator(64, 48);
        this.renderer = new Renderer(this.canvas, this.ctx);
        this.inputManager = new InputManager(this.canvas, this.simulator, this.renderer);
        
        this.isRunning = false;
        this.tickCount = 0;
        this.lastTickTime = Date.now();
        this.tps = 20;
        this.targetTickTime = 1000 / this.tps;
        
        this.setupCanvas();
        this.setupEventListeners();
        this.setupToolbar();
        this.gameLoop();
    }
    
    setupCanvas() {
        const resizeCanvas = () => {
            const container = document.getElementById('canvas-container');
            const rect = container.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            
            // Ensure pixel art style persists after resize
            this.ctx.imageSmoothingEnabled = false;
            
            this.renderer.setViewport(this.canvas.width, this.canvas.height);
        };
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }
    
    setupEventListeners() {
        document.getElementById('play-pause').addEventListener('click', () => {
            this.isRunning = !this.isRunning;
            document.getElementById('play-pause').textContent = this.isRunning ? 'Pause' : 'Play';
        });
        
        document.getElementById('reset').addEventListener('click', () => {
            this.isRunning = false;
            document.getElementById('play-pause').textContent = 'Play';
            this.tickCount = 0;
            document.getElementById('tick-count').textContent = this.tickCount;
            this.lastTickTime = Date.now();
        });
        
        document.getElementById('clear').addEventListener('click', () => {
            this.simulator = new RedstoneSimulator(64, 48);
            this.tickCount = 0;
        });
        
        // Debug controls
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F3') {
                e.preventDefault();
                this.renderer.toggleDebugMode();
            } else if (e.key === 'F4') {
                e.preventDefault();
                this.renderer.toggleQuasiConnectivity();
            }
        });
    }
    
    setupToolbar() {
        const buttons = document.querySelectorAll('.component-button');
        buttons.forEach(button => {
            button.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                this.inputManager.setSelectedComponent(button.dataset.component);
            });
        });
        
        // Set default selection
        buttons[0].classList.add('active');
        this.inputManager.setSelectedComponent('redstone_dust');
    }
    
    gameLoop() {
        const currentTime = Date.now();
        const deltaTime = currentTime - this.lastTickTime;
        
        if (this.isRunning && deltaTime >= this.targetTickTime) {
            this.simulator.tick();
            this.tickCount++;
            this.lastTickTime = currentTime;
            
            document.getElementById('tick-count').textContent = this.tickCount;
            document.getElementById('tps').textContent = this.tps;
        }
        
        this.renderer.render(this.simulator);
        requestAnimationFrame(() => this.gameLoop());
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new RedstoneCircuitDesigner();
});


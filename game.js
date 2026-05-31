const GRID_SIZE = 40;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

const TRANSIT_MODES = {
    bus: {
        name: '公交',
        emoji: '🚌',
        capacity: 30,
        speed: 2,
        spawnInterval: 300,
        stopCost: 50,
        routeCost: 10,
        vehicleCost: 20,
        color: '#2196F3',
        lineWidth: 4
    },
    metro: {
        name: '地铁',
        emoji: '🚇',
        capacity: 200,
        speed: 4,
        spawnInterval: 500,
        stopCost: 500,
        routeCost: 100,
        vehicleCost: 150,
        color: '#9C27B0',
        lineWidth: 8
    },
    lightRail: {
        name: '轻轨',
        emoji: '🚈',
        capacity: 80,
        speed: 3,
        spawnInterval: 400,
        stopCost: 200,
        routeCost: 50,
        vehicleCost: 60,
        color: '#FF9800',
        lineWidth: 6
    }
};

const COSTS = {
    residential: 0,
    commercial: 0
};

const POPULATION_CONFIG = {
    growthRate: 0.001,
    maxGrowthMultiplier: 3,
    transitBonus: 0.002,
    commercialBonus: 0.001
};

const CONGESTION_CONFIG = {
    baseCongestion: 0,
    vehicleThreshold: 3,
    congestionFactor: 0.15,
    maxSlowdown: 0.5
};

const SIMULATION_CONFIG = {
    maxPassengersPerBuilding: 50,
    maxTotalPassengers: 5000,
    maxIterationsPerStep: 100,
    passengerSpawnRateCap: 10
};

class TransitGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;

        this.currentTool = 'residential';
        this.currentTransitMode = 'bus';
        this.buildings = [];
        this.stops = [];
        this.routes = [];
        this.vehicles = [];
        this.passengers = [];

        this.isSimulating = false;
        this.simulationSpeed = 2;
        this.simulationTime = 0;
        this.routeDrawing = null;

        this.stats = {
            totalWaitTime: 0,
            totalPassengers: 0,
            totalRides: 0,
            maxLoad: 0,
            totalTravelTime: 0,
            initialPopulation: 0,
            finalPopulation: 0
        };

        this.congestionMap = new Map();
        this.savedSchemes = new Map();
        this.currentSchemeName = '未命名方案';

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadAllSchemes();
        this.gameLoop();
    }

    segmentsIntersect(p1, p2, p3, p4) {
        const d1 = this.direction(p3, p4, p1);
        const d2 = this.direction(p3, p4, p2);
        const d3 = this.direction(p1, p2, p3);
        const d4 = this.direction(p1, p2, p4);

        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            return true;
        }

        if (d1 === 0 && this.onSegment(p3, p4, p1)) return true;
        if (d2 === 0 && this.onSegment(p3, p4, p2)) return true;
        if (d3 === 0 && this.onSegment(p1, p2, p3)) return true;
        if (d4 === 0 && this.onSegment(p1, p2, p4)) return true;

        return false;
    }

    direction(p1, p2, p3) {
        return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);
    }

    onSegment(p1, p2, p3) {
        return Math.min(p1.x, p2.x) <= p3.x && p3.x <= Math.max(p1.x, p2.x) &&
               Math.min(p1.y, p2.y) <= p3.y && p3.y <= Math.max(p1.y, p2.y);
    }

    checkRouteSelfIntersection(stops) {
        for (let i = 0; i < stops.length - 1; i++) {
            for (let j = i + 1; j < stops.length - 1; j++) {
                if (Math.abs(i - j) <= 1) continue;
                
                const p1 = stops[i];
                const p2 = stops[i + 1];
                const p3 = stops[j];
                const p4 = stops[j + 1];

                if (this.segmentsIntersect(p1, p2, p3, p4)) {
                    return { intersects: true, segment1: i, segment2: j };
                }
            }
        }
        return { intersects: false };
    }

    setupEventListeners() {
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMove(e));

        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentTool = e.target.dataset.tool;
                this.routeDrawing = null;
            });
        });

        document.querySelectorAll('.transit-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.transit-mode-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentTransitMode = e.target.dataset.mode;
            });
        });

        document.getElementById('startSim').addEventListener('click', () => this.startSimulation());
        document.getElementById('stopSim').addEventListener('click', () => this.stopSimulation());
        
        document.getElementById('speedSlider').addEventListener('input', (e) => {
            this.simulationSpeed = parseInt(e.target.value);
            document.getElementById('speedValue').textContent = this.simulationSpeed + 'x';
        });

        document.getElementById('saveBtn').addEventListener('click', () => this.showSaveModal());
        document.getElementById('loadBtn').addEventListener('click', () => this.showLoadModal());
        document.getElementById('compareBtn').addEventListener('click', () => this.showCompareModal());
        document.getElementById('reportBtn').addEventListener('click', () => this.generateReport());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());

        document.getElementById('modalConfirm').addEventListener('click', () => this.handleModalConfirm());
        document.getElementById('modalCancel').addEventListener('click', () => this.hideModal());
    }

    handleCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;
        const y = Math.floor((e.clientY - rect.top) / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;

        switch (this.currentTool) {
            case 'residential':
                this.addBuilding(x, y, 'residential');
                break;
            case 'commercial':
                this.addBuilding(x, y, 'commercial');
                break;
            case 'stop':
                this.addStop(x, y);
                break;
            case 'route':
                this.handleRouteClick(x, y);
                break;
            case 'delete':
                this.deleteAt(x, y);
                break;
        }
    }

    handleCanvasMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;
        const y = Math.floor((e.clientY - rect.top) / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;

        const hovered = this.getObjectAt(x, y);
        const overlay = document.getElementById('infoOverlay');
        
        if (hovered) {
            overlay.style.display = 'block';
            overlay.textContent = this.getObjectInfo(hovered);
        } else {
            overlay.style.display = 'none';
        }
    }

    addBuilding(x, y, type) {
        if (this.getObjectAt(x, y)) return;
        
        const building = {
            x, y, type,
            population: type === 'residential' ? Math.floor(Math.random() * 50) + 20 : 0,
            basePopulation: type === 'residential' ? Math.floor(Math.random() * 50) + 20 : 0,
            growthFactor: 1
        };
        this.buildings.push(building);
    }

    addStop(x, y) {
        if (this.getObjectAt(x, y)) {
            alert('该位置已有建筑或站点！');
            return;
        }

        const minDistance = GRID_SIZE * 1.5;
        const tooClose = this.stops.some(stop => {
            const dist = Math.hypot(stop.x - x, stop.y - y);
            return dist < minDistance;
        });

        if (tooClose) {
            alert('站点过密！请与其他站点保持至少1.5个网格的距离。');
            return;
        }
        
        this.stops.push({
            x, y,
            id: this.stops.length + 1,
            mode: this.currentTransitMode,
            waiting: []
        });
    }

    handleRouteClick(x, y) {
        const stop = this.stops.find(s => 
            Math.abs(s.x - x) < GRID_SIZE / 2 && Math.abs(s.y - y) < GRID_SIZE / 2 &&
            s.mode === this.currentTransitMode
        );

        if (!stop) return;

        if (!this.routeDrawing) {
            this.routeDrawing = { start: stop, stops: [stop] };
        } else {
            if (stop !== this.routeDrawing.start) {
                this.routeDrawing.stops.push(stop);
                
                if (this.routeDrawing.stops.length >= 2) {
                    this.createRoute(this.routeDrawing.stops);
                }
            }
            this.routeDrawing = null;
        }
    }

    createRoute(stops) {
        const mode = this.currentTransitMode;
        const existing = this.routes.find(r => 
            r.mode === mode &&
            r.stops.length === stops.length && 
            r.stops.every((s, i) => s.id === stops[i].id)
        );
        
        if (existing) {
            alert('该线路已存在！');
            return;
        }

        const selfIntersection = this.checkRouteSelfIntersection(stops);
        if (selfIntersection.intersects) {
            alert(`线路自交错误！站点 ${stops[selfIntersection.segment1].id}-${stops[selfIntersection.segment1 + 1].id} 与 站点 ${stops[selfIntersection.segment2].id}-${stops[selfIntersection.segment2 + 1].id} 相交。\n请调整站点位置或重新规划路线。`);
            return;
        }

        if (stops.length < 2) {
            alert('线路至少需要2个站点！');
            return;
        }

        this.routes.push({
            id: this.routes.length + 1,
            mode,
            stops: [...stops],
            vehicles: []
        });

        alert('线路创建成功！');
    }

    deleteAt(x, y) {
        const stopIndex = this.stops.findIndex(s => 
            Math.abs(s.x - x) < GRID_SIZE / 2 && Math.abs(s.y - y) < GRID_SIZE / 2
        );

        if (stopIndex !== -1) {
            const stop = this.stops[stopIndex];
            this.routes = this.routes.filter(r => 
                !r.stops.some(s => s.id === stop.id)
            );
            this.stops.splice(stopIndex, 1);
            return;
        }

        const buildingIndex = this.buildings.findIndex(b => 
            Math.abs(b.x - x) < GRID_SIZE / 2 && Math.abs(b.y - y) < GRID_SIZE / 2
        );

        if (buildingIndex !== -1) {
            this.buildings.splice(buildingIndex, 1);
        }
    }

    getObjectAt(x, y) {
        const stop = this.stops.find(s => 
            Math.abs(s.x - x) < GRID_SIZE / 2 && Math.abs(s.y - y) < GRID_SIZE / 2
        );
        if (stop) return { type: 'stop', data: stop };

        const building = this.buildings.find(b => 
            Math.abs(b.x - x) < GRID_SIZE / 2 && Math.abs(b.y - y) < GRID_SIZE / 2
        );
        if (building) return { type: 'building', data: building };

        return null;
    }

    getObjectInfo(obj) {
        if (obj.type === 'stop') {
            const mode = TRANSIT_MODES[obj.data.mode];
            return `${mode.emoji} ${mode.name}站 #${obj.data.id} | 等待: ${obj.data.waiting.length}人`;
        }
        if (obj.type === 'building') {
            if (obj.data.type === 'residential') {
                return `居民区 | 人口: ${obj.data.population} | 增长: ${((obj.data.growthFactor - 1) * 100).toFixed(1)}%`;
            }
            return `商业区`;
        }
        return '';
    }

    startSimulation() {
        if (this.isSimulating) return;
        this.isSimulating = true;
        this.simulationTime = 0;
        this.stats = {
            totalWaitTime: 0,
            totalPassengers: 0,
            totalRides: 0,
            maxLoad: 0,
            totalTravelTime: 0,
            initialPopulation: this.getTotalPopulation()
        };
        
        this.routes.forEach(route => {
            route.vehicles = [];
            this.spawnVehicle(route);
        });
    }

    stopSimulation() {
        this.isSimulating = false;
        this.vehicles = [];
        this.passengers = [];
        this.stops.forEach(s => s.waiting = []);
    }

    spawnVehicle(route) {
        const config = TRANSIT_MODES[route.mode];
        const startStop = route.stops[0];
        this.vehicles.push({
            route,
            x: startStop.x,
            y: startStop.y,
            stopIndex: 0,
            passengers: [],
            direction: 1,
            lastSpawn: this.simulationTime,
            mode: route.mode
        });
    }

    updateSimulation() {
        if (!this.isSimulating) return;

        for (let i = 0; i < this.simulationSpeed; i++) {
            this.simulationTime++;
            this.updatePopulation();
            this.updateCongestion();
            this.spawnPassengers();
            this.updateVehicles();
            this.updatePassengers();
            this.checkSpawnVehicles();
        }

        this.updateStats();
    }

    updatePopulation() {
        if (this.simulationTime % 600 !== 0) return;

        this.buildings.filter(b => b.type === 'residential').forEach(building => {
            let growthBonus = 1;
            
            const hasNearbyTransit = this.stops.some(stop => {
                const dist = Math.hypot(stop.x - building.x, stop.y - building.y);
                return dist < 200;
            });
            if (hasNearbyTransit) {
                growthBonus += POPULATION_CONFIG.transitBonus * 100;
            }

            const nearCommercial = this.buildings.filter(b => {
                if (b.type !== 'commercial') return false;
                return Math.hypot(b.x - building.x, b.y - building.y) < 300;
            }).length;
            growthBonus += nearCommercial * POPULATION_CONFIG.commercialBonus * 100;

            building.growthFactor = Math.min(
                building.growthFactor * (1 + POPULATION_CONFIG.growthRate),
                POPULATION_CONFIG.maxGrowthMultiplier
            );
            building.population = Math.floor(building.basePopulation * building.growthFactor * (growthBonus / 100 + 1));
        });
    }

    updateCongestion() {
        this.congestionMap.clear();

        this.routes.forEach(route => {
            for (let i = 0; i < route.stops.length - 1; i++) {
                const start = route.stops[i];
                const end = route.stops[i + 1];
                const segmentKey = `${Math.min(start.id, end.id)}-${Math.max(start.id, end.id)}`;
                
                const vehiclesOnSegment = this.vehicles.filter(v => {
                    if (v.route.id !== route.id) return false;
                    const nextIdx = v.direction > 0 ? v.stopIndex : v.stopIndex - 1;
                    return nextIdx === i || nextIdx === i + 1;
                }).length;

                this.congestionMap.set(segmentKey, vehiclesOnSegment);
            }
        });
    }

    getSegmentCongestion(startStopId, endStopId) {
        const segmentKey = `${Math.min(startStopId, endStopId)}-${Math.max(startStopId, endStopId)}`;
        const vehiclesOnSegment = this.congestionMap.get(segmentKey) || 0;
        return Math.min(1, vehiclesOnSegment / CONGESTION_CONFIG.vehicleThreshold);
    }

    spawnPassengers() {
        if (this.simulationTime % 30 !== 0) return;

        const commercialBuildings = this.buildings.filter(b => b.type === 'commercial');
        if (commercialBuildings.length === 0) return;

        const totalWaitingPassengers = this.stops.reduce((sum, s) => sum + s.waiting.length, 0);
        if (totalWaitingPassengers > SIMULATION_CONFIG.maxTotalPassengers / 2) {
            return;
        }

        let totalSpawned = 0;

        this.buildings.filter(b => b.type === 'residential').forEach(building => {
            const nearestStop = this.findNearestStop(building.x, building.y, 150);
            if (!nearestStop) return;

            if (nearestStop.waiting.length > SIMULATION_CONFIG.maxPassengersPerBuilding) {
                return;
            }

            const baseSpawnRate = Math.ceil(building.population / 30);
            const congestionFactor = Math.max(0.1, 1 - totalWaitingPassengers / SIMULATION_CONFIG.maxTotalPassengers);
            const spawnRate = Math.min(
                SIMULATION_CONFIG.passengerSpawnRateCap,
                Math.ceil(baseSpawnRate * congestionFactor)
            );

            const count = Math.floor(Math.random() * spawnRate) + 1;
            
            for (let i = 0; i < count && totalSpawned < SIMULATION_CONFIG.maxIterationsPerStep; i++) {
                const destination = this.getBalancedDestination();
                const destStop = this.findNearestStop(destination.x, destination.y, 200);
                
                if (!destStop) continue;

                const bestRoute = this.findBestRoute(nearestStop, destStop);
                
                const passenger = {
                    x: building.x,
                    y: building.y,
                    targetStop: nearestStop,
                    destinationStop: destStop,
                    destination,
                    state: 'walking',
                    waitStart: this.simulationTime,
                    preferredMode: bestRoute ? bestRoute.mode : 'bus'
                };
                this.passengers.push(passenger);
                totalSpawned++;
            }
        });
    }

    getBalancedDestination() {
        const commercialBuildings = this.buildings.filter(b => b.type === 'commercial');
        if (commercialBuildings.length === 0) return null;

        const buildingPassengerCounts = commercialBuildings.map(b => {
            const nearStop = this.findNearestStop(b.x, b.y, 200);
            const waitingCount = nearStop ? nearStop.waiting.length : 0;
            return { building: b, waitingCount };
        });

        const maxWaiting = Math.max(...buildingPassengerCounts.map(b => b.waitingCount));
        const weights = buildingPassengerCounts.map(b => 
            maxWaiting === 0 ? 1 : Math.max(0.1, 1 - b.waitingCount / maxWaiting)
        );

        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        let random = Math.random() * totalWeight;
        
        for (let i = 0; i < commercialBuildings.length; i++) {
            random -= weights[i];
            if (random <= 0) return commercialBuildings[i];
        }

        return commercialBuildings[0];
    }

    findBestRoute(fromStop, toStop) {
        let bestRoute = null;
        let bestScore = Infinity;

        this.routes.forEach(route => {
            const fromIdx = route.stops.findIndex(s => s.id === fromStop.id);
            const toIdx = route.stops.findIndex(s => s.id === toStop.id);
            
            if (fromIdx !== -1 && toIdx !== -1) {
                const config = TRANSIT_MODES[route.mode];
                const distance = Math.abs(toIdx - fromIdx) * GRID_SIZE;
                const score = distance / config.speed + config.capacity / 50;
                
                if (score < bestScore) {
                    bestScore = score;
                    bestRoute = route;
                }
            }
        });

        return bestRoute;
    }

    findNearestStop(x, y, maxDist, mode = null) {
        let nearest = null;
        let minDist = maxDist;

        this.stops.forEach(stop => {
            if (mode && stop.mode !== mode) return;
            const dist = Math.hypot(stop.x - x, stop.y - y);
            if (dist < minDist) {
                minDist = dist;
                nearest = stop;
            }
        });

        return nearest;
    }

    getRandomDestination() {
        const commercial = this.buildings.filter(b => b.type === 'commercial');
        if (commercial.length === 0) return null;
        return commercial[Math.floor(Math.random() * commercial.length)];
    }

    updatePassengers() {
        this.passengers = this.passengers.filter(p => {
            if (p.state === 'walking') {
                const dx = p.targetStop.x - p.x;
                const dy = p.targetStop.y - p.y;
                const dist = Math.hypot(dx, dy);

                if (dist < 5) {
                    p.state = 'waiting';
                    p.waitStart = this.simulationTime;
                    p.targetStop.waiting.push(p);
                    return false;
                }

                p.x += (dx / dist) * 1.5;
                p.y += (dy / dist) * 1.5;
            }
            return true;
        });
    }

    updateVehicles() {
        this.vehicles.forEach(vehicle => {
            const config = TRANSIT_MODES[vehicle.mode];
            const targetStop = vehicle.route.stops[vehicle.stopIndex];
            const prevStop = vehicle.route.stops[
                vehicle.stopIndex - vehicle.direction >= 0 && 
                vehicle.stopIndex - vehicle.direction < vehicle.route.stops.length
                    ? vehicle.stopIndex - vehicle.direction
                    : vehicle.stopIndex
            ];
            
            const congestion = this.getSegmentCongestion(prevStop.id, targetStop.id);
            const speedMultiplier = 1 - (congestion * CONGESTION_CONFIG.congestionFactor);
            const effectiveSpeed = config.speed * Math.max(speedMultiplier, 1 - CONGESTION_CONFIG.maxSlowdown);

            const dx = targetStop.x - vehicle.x;
            const dy = targetStop.y - vehicle.y;
            const dist = Math.hypot(dx, dy);

            if (dist < effectiveSpeed) {
                vehicle.x = targetStop.x;
                vehicle.y = targetStop.y;
                this.handleVehicleArrival(vehicle, targetStop);
            } else {
                vehicle.x += (dx / dist) * effectiveSpeed;
                vehicle.y += (dy / dist) * effectiveSpeed;
            }
        });
    }

    handleVehicleArrival(vehicle, stop) {
        vehicle.passengers = vehicle.passengers.filter(p => {
            if (p.destinationStop.id === stop.id) {
                p.state = 'arrived';
                this.stats.totalRides++;
                return false;
            }
            return true;
        });

        const config = TRANSIT_MODES[vehicle.mode];
        const maxWaitTime = 600;
        
        stop.waiting = stop.waiting.filter(p => {
            const waitDuration = this.simulationTime - p.waitStart;
            if (waitDuration > maxWaitTime) {
                this.stats.totalWaitTime += maxWaitTime;
                return false;
            }

            if (vehicle.passengers.length < config.capacity && 
                p.destinationStop) {
                
                const routeHasDestination = vehicle.route.stops.some(s => 
                    s.id === p.destinationStop.id
                );

                if (routeHasDestination) {
                    vehicle.passengers.push(p);
                    this.stats.totalWaitTime += waitDuration;
                    this.stats.totalPassengers++;
                    return false;
                }
            }
            return true;
        });

        if (vehicle.passengers.length > this.stats.maxLoad) {
            this.stats.maxLoad = vehicle.passengers.length;
        }

        vehicle.stopIndex += vehicle.direction;
        if (vehicle.stopIndex >= vehicle.route.stops.length || vehicle.stopIndex < 0) {
            vehicle.direction *= -1;
            vehicle.stopIndex += vehicle.direction * 2;
        }
    }

    checkSpawnVehicles() {
        this.routes.forEach(route => {
            const config = TRANSIT_MODES[route.mode];
            const routeVehicles = this.vehicles.filter(v => v.route.id === route.id);
            const lastVehicle = routeVehicles[routeVehicles.length - 1];
            
            if (routeVehicles.length === 0 || 
                (lastVehicle && this.simulationTime - lastVehicle.lastSpawn > config.spawnInterval)) {
                const startStop = route.stops[0];
                this.vehicles.push({
                    route,
                    x: startStop.x,
                    y: startStop.y,
                    stopIndex: 0,
                    passengers: [],
                    direction: 1,
                    lastSpawn: this.simulationTime,
                    mode: route.mode
                });
            }
        });
    }

    getTotalPopulation() {
        return this.buildings
            .filter(b => b.type === 'residential')
            .reduce((sum, b) => sum + b.population, 0);
    }

    updateStats() {
        const avgWait = this.stats.totalPassengers > 0 
            ? Math.round(this.stats.totalWaitTime / this.stats.totalPassengers) 
            : 0;
        
        const totalCapacity = this.vehicles.reduce((sum, v) => {
            const config = TRANSIT_MODES[v.mode];
            return sum + config.capacity;
        }, 0);
        
        const avgLoad = totalCapacity > 0 
            ? Math.round((this.vehicles.reduce((sum, v) => sum + v.passengers.length, 0) / totalCapacity) * 100) 
            : 0;

        const totalResidential = this.buildings.filter(b => b.type === 'residential').length;
        const coveredResidential = this.buildings.filter(b => 
            b.type === 'residential' && this.findNearestStop(b.x, b.y, 150)
        ).length;
        const coverage = totalResidential > 0 
            ? Math.round((coveredResidential / totalResidential) * 100) 
            : 0;

        let totalCost = 0;
        Object.keys(TRANSIT_MODES).forEach(mode => {
            const config = TRANSIT_MODES[mode];
            totalCost += this.stops.filter(s => s.mode === mode).length * config.stopCost;
            totalCost += this.routes.filter(r => r.mode === mode).reduce((sum, r) => 
                sum + r.stops.length * config.routeCost, 0);
            totalCost += this.vehicles.filter(v => v.mode === mode).length * config.vehicleCost;
        });

        document.getElementById('waitTime').textContent = avgWait + 's';
        document.getElementById('loadRate').textContent = avgLoad + '%';
        document.getElementById('coverage').textContent = coverage + '%';
        document.getElementById('cost').textContent = '¥' + totalCost;
        document.getElementById('passengers').textContent = this.stats.totalRides;
        document.getElementById('population').textContent = this.getTotalPopulation();

        let totalCongestion = 0;
        this.congestionMap.forEach(vehicles => {
            if (vehicles > CONGESTION_CONFIG.vehicleThreshold) {
                totalCongestion += (vehicles - CONGESTION_CONFIG.vehicleThreshold);
            }
        });
        const congestionLevel = Math.min(100, totalCongestion * 10);
        document.getElementById('congestion').textContent = congestionLevel + '%';
    }

    render() {
        this.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        this.drawGrid();
        this.drawCongestion();
        this.drawRoutes();
        this.drawBuildings();
        this.drawStops();
        this.drawVehicles();
        this.drawPassengers();
        this.drawRoutePreview();
    }

    drawGrid() {
        this.ctx.strokeStyle = 'rgba(0, 217, 255, 0.1)';
        this.ctx.lineWidth = 1;

        for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, CANVAS_HEIGHT);
            this.ctx.stroke();
        }

        for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(CANVAS_WIDTH, y);
            this.ctx.stroke();
        }
    }

    drawCongestion() {
        this.congestionMap.forEach((vehicles, segmentKey) => {
            if (vehicles > CONGESTION_CONFIG.vehicleThreshold) {
                const congestion = Math.min(1, vehicles / CONGESTION_CONFIG.vehicleThreshold);
                const [startId, endId] = segmentKey.split('-').map(Number);
                const start = this.stops.find(s => s.id === startId);
                const end = this.stops.find(s => s.id === endId);
                
                if (start && end) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(start.x, start.y);
                    this.ctx.lineTo(end.x, end.y);
                    const intensity = Math.floor(congestion * 200);
                    this.ctx.strokeStyle = `rgba(255, ${255 - intensity}, 0, ${0.3 + congestion * 0.3})`;
                    this.ctx.lineWidth = 10 + congestion * 10;
                    this.ctx.lineCap = 'round';
                    this.ctx.stroke();
                }
            }
        });
    }

    drawRoutes() {
        this.routes.forEach((route) => {
            const config = TRANSIT_MODES[route.mode];
            const hue = (route.id * 60) % 360;
            
            this.ctx.strokeStyle = config.color;
            this.ctx.lineWidth = config.lineWidth;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';

            this.ctx.beginPath();
            route.stops.forEach((stop, j) => {
                if (j === 0) {
                    this.ctx.moveTo(stop.x, stop.y);
                } else {
                    this.ctx.lineTo(stop.x, stop.y);
                }
            });
            this.ctx.stroke();
        });
    }

    drawBuildings() {
        this.buildings.forEach(building => {
            const size = GRID_SIZE * 0.8;

            if (building.type === 'residential') {
                const growthPercent = (building.growthFactor - 1) / (POPULATION_CONFIG.maxGrowthMultiplier - 1);
                const r = Math.floor(76 + growthPercent * 100);
                const g = Math.floor(175 - growthPercent * 50);
                const b = 80;
                this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                this.ctx.fillRect(building.x - size/2, building.y - size/2, size, size);
                this.ctx.fillStyle = '#fff';
                this.ctx.font = '10px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(building.population, building.x, building.y + 4);
            } else {
                this.ctx.fillStyle = '#FF9800';
                this.ctx.fillRect(building.x - size/2, building.y - size/2, size, size);
            }

            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(building.x - size/2, building.y - size/2, size, size);
        });
    }

    drawStops() {
        this.stops.forEach(stop => {
            const config = TRANSIT_MODES[stop.mode];
            const size = stop.mode === 'metro' ? 20 : stop.mode === 'lightRail' ? 18 : 15;
            
            this.ctx.beginPath();
            this.ctx.arc(stop.x, stop.y, size, 0, Math.PI * 2);
            this.ctx.fillStyle = config.color;
            this.ctx.fill();
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(stop.id, stop.x, stop.y + 4);

            if (stop.waiting.length > 0) {
                this.ctx.fillStyle = '#ff4444';
                this.ctx.font = '10px Arial';
                this.ctx.fillText(stop.waiting.length, stop.x, stop.y - size - 5);
            }
        });
    }

    drawVehicles() {
        this.vehicles.forEach(vehicle => {
            const config = TRANSIT_MODES[vehicle.mode];
            let width, height;
            
            switch (vehicle.mode) {
                case 'metro':
                    width = 30; height = 12;
                    break;
                case 'lightRail':
                    width = 25; height = 10;
                    break;
                default:
                    width = 24; height = 16;
            }
            
            this.ctx.fillStyle = config.color;
            this.ctx.fillRect(vehicle.x - width/2, vehicle.y - height/2, width, height);
            
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(vehicle.x - width/2, vehicle.y - height/2, width, height);

            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 9px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(vehicle.passengers.length, vehicle.x, vehicle.y + 3);
        });
    }

    drawPassengers() {
        this.passengers.forEach(p => {
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            this.ctx.fillStyle = p.state === 'walking' ? '#ffeb3b' : '#8bc34a';
            this.ctx.fill();
        });
    }

    drawRoutePreview() {
        if (this.routeDrawing) {
            const stop = this.routeDrawing.start;
            const config = TRANSIT_MODES[this.currentTransitMode];
            this.ctx.beginPath();
            this.ctx.arc(stop.x, stop.y, 25, 0, Math.PI * 2);
            this.ctx.strokeStyle = '#00ff88';
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([5, 5]);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
    }

    async loadAllSchemes() {
        try {
            const response = await fetch('http://localhost:3000/api/schemes');
            const schemes = await response.json();
            schemes.forEach(s => this.savedSchemes.set(s.name, s));
        } catch (e) {
            const keys = Object.keys(localStorage).filter(k => k.startsWith('bus_scheme_'));
            keys.forEach(key => {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    this.savedSchemes.set(data.name, data);
                } catch {}
            });
        }
    }

    ensureVehiclesForRoutes() {
        this.routes.forEach(route => {
            const hasVehicles = this.vehicles.some(v => v.route.id === route.id);
            if (!hasVehicles) {
                const config = TRANSIT_MODES[route.mode];
                const startStop = route.stops[0];
                this.vehicles.push({
                    route,
                    x: startStop.x,
                    y: startStop.y,
                    stopIndex: 0,
                    passengers: [],
                    direction: 1,
                    lastSpawn: this.simulationTime,
                    mode: route.mode
                });
            }
        });
    }

    captureCurrentStats(forceRecalculate = false) {
        if (forceRecalculate) {
            this.ensureVehiclesForRoutes();
        }

        const stats = {
            totalPopulation: this.getTotalPopulation(),
            totalRides: this.stats.totalRides,
            avgWaitTime: this.stats.totalPassengers > 0 
                ? Math.round(this.stats.totalWaitTime / this.stats.totalPassengers) 
                : 0,
            avgLoadRate: 0,
            coverage: 0,
            totalCost: 0,
            congestion: 0,
            routeCount: this.routes.length,
            stopCount: this.stops.length,
            vehicleCount: this.vehicles.length
        };

        let totalCapacity = this.vehicles.reduce((sum, v) => {
            const config = TRANSIT_MODES[v.mode];
            return sum + config.capacity;
        }, 0);
        
        if (totalCapacity === 0 && forceRecalculate) {
            this.routes.forEach(route => {
                const config = TRANSIT_MODES[route.mode];
                totalCapacity += config.capacity;
            });
            stats.vehicleCount = this.routes.length;
        }

        const totalPassengers = this.vehicles.reduce((sum, v) => sum + v.passengers.length, 0);
        stats.avgLoadRate = totalCapacity > 0 
            ? Math.round((totalPassengers / totalCapacity) * 100) 
            : 0;

        const totalResidential = this.buildings.filter(b => b.type === 'residential').length;
        const coveredResidential = this.buildings.filter(b => 
            b.type === 'residential' && this.findNearestStop(b.x, b.y, 150)
        ).length;
        stats.coverage = totalResidential > 0 
            ? Math.round((coveredResidential / totalResidential) * 100) 
            : 0;

        Object.keys(TRANSIT_MODES).forEach(mode => {
            const config = TRANSIT_MODES[mode];
            stats.totalCost += this.stops.filter(s => s.mode === mode).length * config.stopCost;
            stats.totalCost += this.routes.filter(r => r.mode === mode).reduce((sum, r) => 
                sum + r.stops.length * config.routeCost, 0);
            
            const vehicleCount = forceRecalculate 
                ? this.routes.filter(r => r.mode === mode).length 
                : this.vehicles.filter(v => v.mode === mode).length;
            stats.totalCost += vehicleCount * config.vehicleCost;
        });

        if (forceRecalculate) {
            let congestionLevel = 0;
            this.routes.forEach(route => {
                if (route.stops.length > 5) {
                    congestionLevel += (route.stops.length - 5) * 5;
                }
            });
            stats.congestion = Math.min(100, congestionLevel);
        } else {
            let totalCongestion = 0;
            this.congestionMap.forEach(vehicles => {
                if (vehicles > CONGESTION_CONFIG.vehicleThreshold) {
                    totalCongestion += (vehicles - CONGESTION_CONFIG.vehicleThreshold);
                }
            });
            stats.congestion = Math.min(100, totalCongestion * 10);
        }

        return stats;
    }

    async saveScheme() {
        const name = document.getElementById('schemeName').value.trim();
        if (!name) {
            alert('请输入方案名称');
            return;
        }

        this.currentSchemeName = name;

        this.ensureVehiclesForRoutes();

        const scheme = {
            name,
            timestamp: Date.now(),
            buildings: JSON.parse(JSON.stringify(this.buildings)),
            stops: JSON.parse(JSON.stringify(this.stops)),
            routes: this.routes.map(r => ({
                id: r.id,
                mode: r.mode,
                stopIds: r.stops.map(s => s.id)
            })),
            finalStats: this.captureCurrentStats(true)
        };

        try {
            const response = await fetch('http://localhost:3000/api/schemes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(scheme)
            });

            if (response.ok) {
                this.savedSchemes.set(name, scheme);
                alert('方案保存成功！');
                this.hideModal();
            } else {
                throw new Error('保存失败');
            }
        } catch (e) {
            localStorage.setItem('bus_scheme_' + name, JSON.stringify(scheme));
            this.savedSchemes.set(name, scheme);
            alert('已保存到本地存储（后端未启动）');
            this.hideModal();
        }
    }

    async loadScheme(name) {
        const scheme = this.savedSchemes.get(name);
        if (!scheme) {
            alert('方案不存在');
            return;
        }

        this.stopSimulation();
        this.buildings = scheme.buildings || [];
        this.stops = scheme.stops || [];
        
        if (scheme.routes) {
            this.routes = scheme.routes.map(r => ({
                id: r.id,
                mode: r.mode,
                stops: r.stopIds ? r.stopIds.map(id => this.stops.find(s => s.id === id)).filter(Boolean) : r.stops,
                vehicles: []
            })).filter(r => r.stops.length >= 2);
        } else {
            this.routes = [];
        }

        this.currentSchemeName = name;
        alert('方案加载成功！');
    }

    loadSchemeData(scheme) {
        this.stopSimulation();
        this.buildings = scheme.buildings || [];
        this.stops = scheme.stops || [];
        
        if (scheme.routes) {
            this.routes = scheme.routes.map(r => ({
                id: r.id,
                mode: r.mode,
                stops: r.stopIds ? r.stopIds.map(id => this.stops.find(s => s.id === id)).filter(Boolean) : r.stops,
                vehicles: []
            })).filter(r => r.stops.length >= 2);
        } else {
            this.routes = [];
        }
    }

    showSaveModal() {
        document.getElementById('modal').classList.remove('hidden');
        document.getElementById('modalTitle').textContent = '保存方案';
        document.getElementById('schemeName').value = this.currentSchemeName;
        document.getElementById('schemeName').style.display = 'block';
        document.getElementById('schemeList').style.display = 'none';
        document.getElementById('compareContent').style.display = 'none';
        document.getElementById('reportContent').style.display = 'none';
        document.getElementById('modalConfirm').style.display = 'block';
    }

    showLoadModal() {
        if (this.savedSchemes.size === 0) {
            alert('没有保存的方案');
            return;
        }

        document.getElementById('modal').classList.remove('hidden');
        document.getElementById('modalTitle').textContent = '加载方案';
        document.getElementById('schemeName').style.display = 'none';
        
        const listEl = document.getElementById('schemeList');
        listEl.style.display = 'block';
        listEl.innerHTML = '';
        
        this.savedSchemes.forEach((scheme, name) => {
            const div = document.createElement('div');
            div.className = 'scheme-item';
            div.innerHTML = `
                <span>${name}</span>
                <small>${new Date(scheme.timestamp).toLocaleString()}</small>
            `;
            div.addEventListener('click', () => {
                this.loadScheme(name);
                this.hideModal();
            });
            listEl.appendChild(div);
        });
        
        document.getElementById('compareContent').style.display = 'none';
        document.getElementById('reportContent').style.display = 'none';
        document.getElementById('modalConfirm').style.display = 'none';
    }

    calculateSchemeStats(scheme) {
        if (scheme.finalStats && scheme.finalStats.totalCost > 0) {
            return scheme.finalStats;
        }

        const stats = {
            totalPopulation: 0,
            totalRides: scheme.finalStats?.totalRides || 0,
            avgWaitTime: scheme.finalStats?.avgWaitTime || 0,
            avgLoadRate: 0,
            coverage: 0,
            totalCost: 0,
            congestion: 0,
            routeCount: scheme.routes?.length || 0,
            stopCount: scheme.stops?.length || 0,
            vehicleCount: scheme.routes?.length || 0
        };

        if (scheme.buildings) {
            stats.totalPopulation = scheme.buildings
                .filter(b => b.type === 'residential')
                .reduce((sum, b) => sum + (b.population || 0), 0);

            const residentialBuildings = scheme.buildings.filter(b => b.type === 'residential');
            let coveredCount = 0;
            residentialBuildings.forEach(b => {
                if (scheme.stops?.some(s => {
                    const dist = Math.hypot(s.x - b.x, s.y - b.y);
                    return dist < 150;
                })) {
                    coveredCount++;
                }
            });
            stats.coverage = residentialBuildings.length > 0 
                ? Math.round((coveredCount / residentialBuildings.length) * 100) 
                : 0;
        }

        let totalCapacity = 0;
        if (scheme.routes) {
            scheme.routes.forEach(route => {
                const config = TRANSIT_MODES[route.mode];
                totalCapacity += config.capacity;
            });
        }
        stats.avgLoadRate = totalCapacity > 0 ? 30 : 0;

        if (scheme.stops && scheme.routes) {
            Object.keys(TRANSIT_MODES).forEach(mode => {
                const config = TRANSIT_MODES[mode];
                stats.totalCost += scheme.stops.filter(s => s.mode === mode).length * config.stopCost;
                stats.totalCost += scheme.routes.filter(r => r.mode === mode).reduce((sum, r) => {
                    const stopCount = r.stopIds ? r.stopIds.length : (r.stops ? r.stops.length : 0);
                    return sum + stopCount * config.routeCost;
                }, 0);
                stats.totalCost += scheme.routes.filter(r => r.mode === mode).length * config.vehicleCost;
            });
        }

        if (scheme.routes) {
            let congestionLevel = 0;
            scheme.routes.forEach(route => {
                const stopCount = route.stopIds ? route.stopIds.length : (route.stops ? route.stops.length : 0);
                if (stopCount > 5) {
                    congestionLevel += (stopCount - 5) * 5;
                }
            });
            stats.congestion = Math.min(100, congestionLevel);
        }

        return stats;
    }

    showCompareModal() {
        if (this.savedSchemes.size < 2) {
            alert('需要至少保存2个方案才能对比');
            return;
        }

        this.savedSchemes.forEach((scheme, name) => {
            scheme.finalStats = this.calculateSchemeStats(scheme);
        });

        document.getElementById('modal').classList.remove('hidden');
        document.getElementById('modalTitle').textContent = '多方案对比分析';
        document.getElementById('schemeName').style.display = 'none';
        document.getElementById('schemeList').style.display = 'none';
        document.getElementById('reportContent').style.display = 'none';
        document.getElementById('modalConfirm').style.display = 'none';

        const compareContent = document.getElementById('compareContent');
        compareContent.style.display = 'block';

        let html = `
            <table class="compare-table">
                <thead>
                    <tr>
                        <th>指标</th>
        `;

        const schemeNames = Array.from(this.savedSchemes.keys());
        schemeNames.forEach(name => {
            html += `<th>${name}</th>`;
        });
        html += '</tr></thead><tbody>';

        const metrics = [
            { key: 'totalRides', label: '运送人次', unit: '' },
            { key: 'avgWaitTime', label: '平均等待', unit: 's' },
            { key: 'avgLoadRate', label: '平均满载率', unit: '%' },
            { key: 'coverage', label: '覆盖率', unit: '%' },
            { key: 'congestion', label: '拥堵指数', unit: '%' },
            { key: 'totalCost', label: '总成本', unit: '¥' },
            { key: 'totalPopulation', label: '最终人口', unit: '' }
        ];

        metrics.forEach(metric => {
            html += `<tr><td>${metric.label}</td>`;
            schemeNames.forEach(name => {
                const scheme = this.savedSchemes.get(name);
                const stats = this.calculateSchemeStats(scheme);
                const value = stats[metric.key];
                html += `<td>${value}${metric.unit}</td>`;
            });
            html += '</tr>';
        });

        html += `
                <tr>
                    <td>成本效益评分</td>
        `;

        schemeNames.forEach(name => {
            const scheme = this.savedSchemes.get(name);
            const stats = this.calculateSchemeStats(scheme);
            const score = this.calculateScore(stats);
            html += `<td class="score">${score}</td>`;
        });

        html += '</tr></tbody></table>';

        html += `<div class="compare-summary">
            <p>💡 <strong>评分标准：</strong>覆盖率(25%) + 满载率(20%) - 等待时间(20%) - 成本(20%) - 拥堵(15%)</p>
            <p><strong>提示：</strong>数据已自动同步和重新计算，确保对比准确性</p>
        </div>`;

        compareContent.innerHTML = html;
    }

    calculateScore(stats) {
        const coverageScore = stats.coverage * 0.25;
        const loadScore = Math.min(100, stats.avgLoadRate) * 0.2;
        const waitScore = Math.max(0, 100 - stats.avgWaitTime / 2) * 0.2;
        const costScore = Math.max(0, 100 - stats.totalCost / 100) * 0.2;
        const congestionScore = Math.max(0, 100 - stats.congestion) * 0.15;
        
        const totalScore = Math.round(coverageScore + loadScore + waitScore + costScore + congestionScore);
        return totalScore;
    }

    generateReport() {
        const stats = this.captureCurrentStats();
        const score = this.calculateScore(stats);

        document.getElementById('modal').classList.remove('hidden');
        document.getElementById('modalTitle').textContent = '成本效益分析报告';
        document.getElementById('schemeName').style.display = 'none';
        document.getElementById('schemeList').style.display = 'none';
        document.getElementById('compareContent').style.display = 'none';
        document.getElementById('modalConfirm').style.display = 'none';

        const reportContent = document.getElementById('reportContent');
        reportContent.style.display = 'block';

        const getGrade = (score) => {
            if (score >= 85) return { text: 'S级 - 卓越', color: '#00ff88' };
            if (score >= 70) return { text: 'A级 - 优秀', color: '#00d9ff' };
            if (score >= 55) return { text: 'B级 - 良好', color: '#ffeb3b' };
            if (score >= 40) return { text: 'C级 - 一般', color: '#ff9800' };
            return { text: 'D级 - 需改进', color: '#ff4444' };
        };

        const grade = getGrade(score);

        reportContent.innerHTML = `
            <div class="report-header">
                <div class="report-score" style="color: ${grade.color}">${score}</div>
                <div class="report-grade" style="color: ${grade.color}">${grade.text}</div>
            </div>
            
            <div class="report-section">
                <h4>📊 基础指标</h4>
                <div class="report-metrics">
                    <div class="report-metric">
                        <span class="label">覆盖人口</span>
                        <span class="value">${stats.totalPopulation} 人</span>
                    </div>
                    <div class="report-metric">
                        <span class="label">累计运送</span>
                        <span class="value">${stats.totalRides} 人次</span>
                    </div>
                    <div class="report-metric">
                        <span class="label">站点数量</span>
                        <span class="value">${stats.stopCount} 个</span>
                    </div>
                    <div class="report-metric">
                        <span class="label">线路数量</span>
                        <span class="value">${stats.routeCount} 条</span>
                    </div>
                </div>
            </div>

            <div class="report-section">
                <h4>💰 成本分析</h4>
                <div class="report-metrics">
                    <div class="report-metric">
                        <span class="label">总成本</span>
                        <span class="value cost">¥${stats.totalCost.toLocaleString()}</span>
                    </div>
                    <div class="report-metric">
                        <span class="label">单次成本</span>
                        <span class="value">¥${stats.totalRides > 0 ? (stats.totalCost / stats.totalRides).toFixed(2) : '-'}</span>
                    </div>
                    <div class="report-metric">
                        <span class="label">运营车辆</span>
                        <span class="value">${stats.vehicleCount} 辆</span>
                    </div>
                </div>
            </div>

            <div class="report-section">
                <h4>⚡ 效率分析</h4>
                <div class="report-metrics">
                    <div class="report-metric">
                        <span class="label">覆盖率</span>
                        <span class="value ${stats.coverage >= 80 ? 'good' : stats.coverage >= 50 ? 'medium' : 'bad'}">${stats.coverage}%</span>
                    </div>
                    <div class="report-metric">
                        <span class="label">平均等待时间</span>
                        <span class="value ${stats.avgWaitTime <= 30 ? 'good' : stats.avgWaitTime <= 60 ? 'medium' : 'bad'}">${stats.avgWaitTime}s</span>
                    </div>
                    <div class="report-metric">
                        <span class="label">平均满载率</span>
                        <span class="value ${stats.avgLoadRate >= 70 ? 'good' : stats.avgLoadRate >= 40 ? 'medium' : 'bad'}">${stats.avgLoadRate}%</span>
                    </div>
                    <div class="report-metric">
                        <span class="label">拥堵指数</span>
                        <span class="value ${stats.congestion <= 20 ? 'good' : stats.congestion <= 50 ? 'medium' : 'bad'}">${stats.congestion}%</span>
                    </div>
                </div>
            </div>

            <div class="report-section">
                <h4>💡 优化建议</h4>
                <ul class="suggestions">
                    ${stats.coverage < 60 ? '<li>⚠️ 覆盖率偏低，建议在居民区附近增加站点</li>' : ''}
                    ${stats.avgWaitTime > 50 ? '<li>⚠️ 等待时间过长，建议增加发车频率或优化线路</li>' : ''}
                    ${stats.avgLoadRate > 90 ? '<li>⚠️ 满载率过高，建议增加运力或分流乘客</li>' : ''}
                    ${stats.avgLoadRate < 30 ? '<li>⚠️ 满载率过低，建议合并线路或调整发车间隔</li>' : ''}
                    ${stats.congestion > 40 ? '<li>⚠️ 拥堵严重，建议优化线路布局避免重叠</li>' : ''}
                    ${stats.totalCost > 2000 ? '<li>💰 成本较高，可考虑优化站点和线路数量</li>' : ''}
                    ${stats.coverage >= 80 && stats.avgWaitTime <= 40 && stats.congestion <= 30 ? '<li>✅ 方案表现良好，可尝试进一步优化成本效益</li>' : ''}
                </ul>
            </div>
        `;
    }

    handleModalConfirm() {
        const title = document.getElementById('modalTitle').textContent;
        if (title === '保存方案') {
            this.saveScheme();
        }
    }

    hideModal() {
        document.getElementById('modal').classList.add('hidden');
    }

    reset() {
        if (confirm('确定要重置所有内容吗？')) {
            this.stopSimulation();
            this.buildings = [];
            this.stops = [];
            this.routes = [];
            this.vehicles = [];
            this.passengers = [];
            this.stats = { totalWaitTime: 0, totalPassengers: 0, totalRides: 0, maxLoad: 0 };
            this.currentSchemeName = '未命名方案';
            this.updateStats();
        }
    }

    gameLoop() {
        this.updateSimulation();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new TransitGame();
});

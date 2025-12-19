// server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Раздаем файл игры
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- ДАННЫЕ ИГРЫ ---
const TILE_SIZE = 16;
const WORLD_SIZE = 800;

let players = {}; // Список игроков { id: {x, y, ...} }
let world = {};   // Мир (деревья, камни)

// Генерируем мир один раз при запуске сервера
function generateWorld() {
    for(let y=0; y<50; y++) {
        for(let x=0; x<50; x++) {
            if (x > 20 && x < 30 && y > 20 && y < 30) continue; // Спавн
            let key = `${x}_${y}`;
            let rand = Math.random();
            if (rand < 0.1) world[key] = { type: 'tree', hp: 3 };
            else if (rand < 0.15) world[key] = { type: 'rock', hp: 5 };
        }
    }
    console.log(`Мир создан: ${Object.keys(world).length} объектов.`);
}
generateWorld();

// --- СОБЫТИЯ ---
io.on('connection', (socket) => {
    console.log('Игрок подключился:', socket.id);

    // Создаем нового игрока
    players[socket.id] = {
        x: WORLD_SIZE / 2,
        y: WORLD_SIZE / 2,
        direction: 1,
        moving: false,
        inventory: { wood: 0, stone: 0 }
    };

    // Отправляем игроку текущий мир и список всех игроков
    socket.emit('currentWorld', world);
    socket.emit('currentPlayers', players);
    
    // Сообщаем всем остальным, что зашел новый игрок
    socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

    // Игрок двигается
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].direction = data.direction;
            players[socket.id].moving = data.moving;
            // Рассылаем всем новые координаты этого игрока
            socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
        }
    });

    // Игрок взаимодействует (рубит/строит)
    socket.on('interact', (data) => {
        let key = `${data.gx}_${data.gy}`;
        
        // Логика рубки
        if (world[key]) {
            world[key].hp--;
            // Эффект удара всем
            io.emit('objectHit', { key: key });

            if (world[key].hp <= 0) {
                // Объект уничтожен
                let type = world[key].type;
                delete world[key];
                
                // Обновляем инвентарь игрока на сервере (для безопасности)
                if (type === 'tree') players[socket.id].inventory.wood += 2;
                if (type === 'rock') players[socket.id].inventory.stone += 1;
                if (type === 'wall') players[socket.id].inventory.wood += 1;
                
                // Сообщаем всем удалить объект и обновляем инвентарь владельца
                io.emit('objectDestroyed', key);
                socket.emit('updateInventory', players[socket.id].inventory);
            }
        } 
        // Логика стройки
        else if (data.type === 'build') {
            if (players[socket.id].inventory.wood >= 2) {
                players[socket.id].inventory.wood -= 2;
                world[key] = { type: 'wall', hp: 3 };
                io.emit('objectCreated', { key: key, obj: world[key] });
                socket.emit('updateInventory', players[socket.id].inventory);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Игрок вышел:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

http.listen(3000, () => {
    console.log('Сервер запущен на http://localhost:3000');
});
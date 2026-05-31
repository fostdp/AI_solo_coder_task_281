const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function readData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('读取数据文件失败:', e);
    }
    return { schemes: [] };
}

function writeData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('写入数据文件失败:', e);
    }
}

app.get('/api/schemes', (req, res) => {
    const data = readData();
    res.json(data.schemes);
});

app.post('/api/schemes', (req, res) => {
    const scheme = req.body;
    
    if (!scheme.name) {
        return res.status(400).json({ error: '方案名称不能为空' });
    }

    const data = readData();
    
    const existingIndex = data.schemes.findIndex(s => s.name === scheme.name);
    if (existingIndex !== -1) {
        data.schemes[existingIndex] = scheme;
    } else {
        data.schemes.push(scheme);
    }

    writeData(data);
    res.json({ success: true, scheme });
});

app.delete('/api/schemes/:name', (req, res) => {
    const name = req.params.name;
    const data = readData();
    
    data.schemes = data.schemes.filter(s => s.name !== name);
    writeData(data);
    
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`公交路线优化沙盘服务器运行在 http://localhost:${PORT}`);
    console.log(`直接访问: http://localhost:${PORT}/index.html`);
});
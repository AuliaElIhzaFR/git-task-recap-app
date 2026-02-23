import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import { GiteaService } from './services/gitea.service.js';
import { ExcelService } from './services/excel.service.js';
import { AiService } from './services/ai.service.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// Ensure exports directory exists
const EXPORTS_DIR = path.join(process.cwd(), 'exports');
if (!fs.existsSync(EXPORTS_DIR)) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// HTML Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

app.get('/history', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/history.html'));
});

const giteaService = new GiteaService();
const excelService = new ExcelService();
const aiService = new AiService();

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Generate a token
    const token = await giteaService.loginWithCredentials(username, password);
    
    // Verify the token and get user info
    const user = await giteaService.verifyUser(token);
    
    res.json({ user, token });
  } catch (error: any) {
    res.status(401).json({ error: error.message || 'Login failed' });
  }
});

app.get('/api/verify', async (req, res) => {
  try {
    const pat = req.headers.authorization?.split(' ')[1];
    if (!pat) {
      return res.status(401).json({ error: 'Token is required' });
    }
    const user = await giteaService.verifyUser(pat);
    res.json(user);
  } catch (error: any) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/projects', async (req, res) => {
  try {
    const pat = req.headers.authorization?.split(' ')[1];
    if (!pat) return res.status(401).json({ error: 'Unauthorized' });
    
    const projects = await giteaService.getProjects(pat);
    res.json(projects);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch projects' });
  }
});

app.post('/api/commits', async (req, res) => {
  try {
    const pat = req.headers.authorization?.split(' ')[1];
    if (!pat) return res.status(401).json({ error: 'Unauthorized' });

    const { owner, repoName, authorName, authorEmail, since, until } = req.body;
    if (!owner || !repoName || (!authorName && !authorEmail) || !since || !until) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const commits = await giteaService.getCommits(pat, owner, repoName, authorName, authorEmail, since, until);
    res.json(commits);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch commits' });
  }
});

app.post('/api/clean-commits', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { commits } = req.body;
    if (!commits || !Array.isArray(commits)) {
      return res.status(400).json({ error: 'Missing or invalid commits array' });
    }
    const cleanedCommits = await aiService.cleanCommits(commits);
    res.json(cleanedCommits);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to process commits with AI' });
  }
});

app.post('/api/export', async (req, res) => {
  try {
    const { commits, user, startDate, endDate } = req.body;
    if (!commits || !Array.isArray(commits)) {
      return res.status(400).json({ error: 'Valid commits array is required' });
    }

    const buffer = await excelService.generateExcel(commits, user, startDate, endDate);

    // Create a safe filename using user's real name
    const safeUser = (user || 'Unknown').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_').trim();
    const filename = `Task_Recap_${startDate}_${endDate}_${safeUser}.xlsx`;
    const filePath = path.join(EXPORTS_DIR, filename);
    
    // Save to disk
    await fsp.writeFile(filePath, buffer);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate Excel' });
  }
});

// List export history
app.get('/api/exports', async (req, res) => {
  try {
    const files = await fsp.readdir(EXPORTS_DIR);
    const exportFiles = await Promise.all(
      files
        .filter(f => f.endsWith('.xlsx'))
        .map(async (filename) => {
          const filePath = path.join(EXPORTS_DIR, filename);
          const stat = await fsp.stat(filePath);
          return {
            filename,
            size: stat.size,
            createdAt: stat.birthtime.toISOString(),
            downloadUrl: `/api/exports/${encodeURIComponent(filename)}`
          };
        })
    );
    // Sort newest first
    exportFiles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(exportFiles);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list exports' });
  }
});

// Download a specific historical export
app.get('/api/exports/:filename', async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    // Prevent path traversal
    const filePath = path.join(EXPORTS_DIR, path.basename(filename));
    if (!filePath.startsWith(EXPORTS_DIR)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Export file not found' });
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to download export' });
  }
});

// Delete a specific export
app.delete('/api/exports/:filename', async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(EXPORTS_DIR, path.basename(filename));
    if (!filePath.startsWith(EXPORTS_DIR) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Export not found' });
    }
    await fsp.unlink(filePath);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete export' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

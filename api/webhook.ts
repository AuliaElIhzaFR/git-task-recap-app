import { OdooService } from '../src/services/odoo.service';
import { AttendanceBot } from '../src/bot/telegram.bot';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Odoo Service
const odooService = new OdooService({
    url: process.env.ODOO_URL!,
    database: process.env.ODOO_DB!,
    username: process.env.ODOO_USERNAME!,
    password: process.env.ODOO_PASSWORD!,
});

// Parse allowed user IDs
const allowedUserIds = process.env.ALLOWED_USER_IDS!
    .split(',')
    .map(id => parseInt(id.trim()))
    .filter(id => !isNaN(id));

// Initialize bot in webhook mode
const bot = new AttendanceBot(
    process.env.TELEGRAM_BOT_TOKEN!,
    odooService,
    allowedUserIds,
    { polling: false }
);

export default async function handler(req: any, res: any) {
    if (req.method === 'POST') {
        try {
            const { body } = req;
            if (body) {
                await bot.handleUpdate(body);
            }
            res.status(200).send('OK');
        } catch (error: any) {
            console.error('Error handling webhook update:', error);
            res.status(500).send('Error');
        }
    } else {
        res.status(405).send('Method Not Allowed');
    }
}

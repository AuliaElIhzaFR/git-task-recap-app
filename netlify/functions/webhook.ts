import { Handler } from '@netlify/functions';
import { OdooService } from '../../src/services/odoo.service';
import { AttendanceBot } from '../../src/bot/telegram.bot';
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

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed',
    };
  }

  try {
    if (event.body) {
      const body = JSON.parse(event.body);
      await bot.handleUpdate(body);
    }

    return {
      statusCode: 200,
      body: 'OK',
    };
  } catch (error: any) {
    console.error('Error handling Netlify webhook update:', error);
    return {
      statusCode: 500,
      body: 'Error',
    };
  }
};

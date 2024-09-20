import TelegramBot from 'node-telegram-bot-api';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';

// Ваш API токен для Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; // Извлекаем токен из переменных окружения

// Ваш ключ API YouTube
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY; // Извлекаем ключ из переменных окружения
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search';

// Путь к временной папке на Vercel
const DOWNLOAD_DIR = path.join('/tmp', 'downloads');
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// Создание экземпляра бота
const bot = new TelegramBot(TELEGRAM_TOKEN);

// Обработчик для Vercel
export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { body } = req;

        // Проверка типа обновления
        if (body.message) {
            const msg = body.message;
            const chatId = msg.chat.id;

            // Команда /start
            if (msg.text === '/start') {
                await bot.sendMessage(chatId, "Привет! Отправь мне название песни или исполнителя, и я найду её для тебя.");
            }

            // Поиск видео на YouTube
            if (msg.text && !msg.text.startsWith('/')) {
                try {
                    const searchResults = await searchYouTube(msg.text);
                    if (searchResults.length === 0) {
                        await bot.sendMessage(chatId, "Ничего не найдено.");
                        return res.status(200).send('OK');
                    }

                    const buttons = searchResults.map(video => [{
                        text: video.title,
                        callback_data: JSON.stringify({ title: video.title, id: video.videoId })
                    }]).slice(0, 3);

                    const keyboard = {
                        reply_markup: {
                            inline_keyboard: buttons
                        }
                    };

                    await bot.sendMessage(chatId, "Выберите один из вариантов:", keyboard);
                } catch (err) {
                    await bot.sendMessage(chatId, `Ошибка при поиске: ${err.message}`);
                }
            }
        }

        return res.status(200).send('OK');
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}

// Функция поиска видео на YouTube
async function searchYouTube(query) {
    try {
        const response = await axios.get(YOUTUBE_API_URL, {
            params: {
                part: 'snippet',
                q: query,
                key: YOUTUBE_API_KEY,
                maxResults: 3,
                type: 'video'
            }
        });

        return response.data.items.map(item => ({
            title: item.snippet.title,
            videoId: item.id.videoId
        }));
    } catch (error) {
        throw new Error('Ошибка при поиске видео на YouTube');
    }
}


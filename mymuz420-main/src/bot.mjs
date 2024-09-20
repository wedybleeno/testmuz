import TelegramBot from 'node-telegram-bot-api';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';

// Ваш API токен для Telegram
const TELEGRAM_TOKEN = '7501972161:AAGDX0q-vr0vNliiEUJfgRUMRiLZD1cCZK0';

// Ваш ключ API YouTube
const YOUTUBE_API_KEY = 'AIzaSyDAKMHnAusjct5viWo4STUm6PXL3UD0l0A';
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search';

// Путь к временной папке на Vercel
const DOWNLOAD_DIR = path.join('/tmp', 'downloads');
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// Настройка логирования
const log = (message) => {
    console.log(`[${new Date().toISOString()}] ${message}`);
};

function sanitizeFilename(filename) {
    return filename.replace(/[<>:"/\\|?*]/g, '_');
}

// Создание экземпляра бота
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// Обработчик для Vercel
export default async function handler(req, res) {
    log('Received request:', req.body); // Логируем запрос

    if (req.method === 'POST') {
        const { body } = req;

        // Проверка типа обновления
        if (body.message) {
            const msg = body.message;
            const chatId = msg.chat.id;

            // Команда /start
            if (msg.text === '/start') {
                await bot.sendMessage(chatId, "Привет! Отправь мне название песни или исполнителя, и я найду её для тебя.");
                return res.status(200).send('OK');
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
                    return res.status(200).send('OK');
                } catch (err) {
                    await bot.sendMessage(chatId, `Ошибка при поиске: ${err.message}`);
                    return res.status(200).send('OK');
                }
            }
        }

        // Обработка нажатий на кнопки
        if (body.callback_query) {
            const query = body.callback_query;
            const chatId = query.message.chat.id;
            const { title, id: videoId } = JSON.parse(query.data);

            const url = `https://www.youtube.com/watch?v=${videoId}`;
            const tempFilePath = path.join(DOWNLOAD_DIR, `${sanitizeFilename(videoId)}.webm`);
            const command = `yt-dlp -x --audio-format mp3 -o "${tempFilePath}" "${url}"`;

            await execPromise(command)
                .then(async () => {
                    const newFilePath = tempFilePath.replace('.webm', '.mp3');

                    if (fs.existsSync(newFilePath)) {
                        const sanitizedTitle = sanitizeFilename(title);
                        const finalFilePath = path.join(DOWNLOAD_DIR, `${sanitizedTitle}.mp3`);
                        fs.renameSync(newFilePath, finalFilePath);

                        await bot.sendDocument(chatId, finalFilePath, { filename: `${sanitizedTitle}.mp3`, caption: sanitizedTitle });
                        fs.unlinkSync(finalFilePath); // Удаляем файл после отправки
                        log(`Файл отправлен и удален: ${finalFilePath}`);
                    } else {
                        await bot.sendMessage(chatId, 'Ошибка при скачивании или конвертации файла.');
                    }
                })
                .catch(async error => {
                    log(`Ошибка при скачивании: ${error.message}`);
                    await bot.sendMessage(chatId, `Ошибка при скачивании: ${error.message}`);
                });
        }

        return res.status(200).send('OK');
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}

// Обернуть exec в Promise
const execPromise = (command) => {
    return new Promise((resolve, reject) => {
        exec(command, (error) => {
            if (error) reject(error);
            else resolve();
        });
    });
};

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
        log(`Ошибка при поиске: ${error}`);
        throw new Error('Ошибка при поиске видео на YouTube');
    }
}

import moment from 'moment';
import path from 'path';
import pino from 'pino';
import { LOG_LEVEL } from './appConstants.js';

const IST_OFFSET_MINUTES = 330;

const getIST = () => moment.utc().utcOffset(IST_OFFSET_MINUTES);

const prettyConsoleTransport = pino.transport({
    target: 'pino-pretty',
    options: {
        colorize: true,
        ignore: 'pid,hostname,level-label',
        translateTime: false
    }
});

const fileTransport = pino.transport({
    target: 'pino-pretty',
    options: {
        colorize: false,
        ignore: 'pid,hostname,level-label',
        translateTime: false,
        destination: path.join(process.cwd(), 'logs', 'crm_backend.log'),
        mkdir: true
    }
});

const baseLogger = pino({
    level: LOG_LEVEL || 'info',
    timestamp: () => {
        return `, "time":"${getIST().format('YYYY:MM:DD hh:mm:ss A')}"`;
    },
    formatters: {
        log(object, level, msg) {
            if (object && Object.keys(object).length && (msg == null)) {
                return object;
            }
            return msg == null ? object : { ...object, msg };
        },
    },
    mixin(_context, levelNum) {
        return { 'level-label': pino.levels.labels[levelNum] }
    }
}, pino.multistream([
    { stream: prettyConsoleTransport, level: 'info' },
    // { stream: fileTransport, level: 'info' }
]));

const formatData = (data) => {
    if (data === null || data === undefined) return '';
    if (typeof data === 'object') {
        try {
            return JSON.stringify(data, null, 2);
        } catch (err) {
            return String(data);
        }
    }
    return String(data);
};

export const logger = {
    baseLogger,
    child: function (bindings) {
        return baseLogger.child(bindings);
    },
    log: function (messageOrData, data) {
        logByLevel('info', messageOrData, data);
    },
    info: function (messageOrData, data) {
        logByLevel('info', messageOrData, data);
    },
    error: function (messageOrData, data) {
        logByLevel('error', messageOrData, data);
    },
    warn: function (messageOrData, data) {
        logByLevel('warn', messageOrData, data);
    },
    debug: function (messageOrData, data) {
        logByLevel('debug', messageOrData, data);
    },
    fatal: function (messageOrData, data) {
        logByLevel('fatal', messageOrData, data);
    },
    trace: function (messageOrData, data) {
        logByLevel('trace', messageOrData, data);
    }
};

function logByLevel(level, messageOrData, data) {
    if (arguments.length === 1) {
        baseLogger[level]('');
        return;
    }
    if (typeof messageOrData === 'string') {
        if (data !== undefined) {
            const formattedData = formatData(data);
            baseLogger[level](`${messageOrData}\n${formattedData}`);
        } else {
            baseLogger[level](messageOrData);
        }
    } else {
        const formattedData = formatData(messageOrData);
        baseLogger[level](`\n${formattedData}`);
    }
}
export const registerGlobalErrorHandlers = () => {
    process.on('uncaughtException', (err) => {
        logger.fatal('Uncaught Exception:', err);
        process.exit(1);
    });
    process.on('unhandledRejection', (reason, promise) => {
        logger.fatal('Unhandled Rejection at:', promise, 'reason:', reason);
        process.exit(1);
    });
    process.on('SIGTERM', () => {
        logger.info('SIGTERM received. Shutting down...');
        process.exit(0);
    });
    process.on('SIGINT', () => {
        logger.info('SIGINT received. Shutting down...');
        process.exit(0);
    });
};


export default logger;
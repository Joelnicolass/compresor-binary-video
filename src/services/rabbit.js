import amqp from 'amqplib';
import { infraConfig } from '../config/index.js';

const EXCHANGE = 'jobs.events';

let connection;
let channel;
let connectPromise;
let warnedUnavailable = false;

async function ensureChannel() {
  if (!infraConfig.rabbitmqUrl) {
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn('[rabbitmq] RABBITMQ_URL no configurado; eventos deshabilitados.');
    }
    return null;
  }

  if (channel) return channel;

  if (!connectPromise) {
    connectPromise = amqp
      .connect(infraConfig.rabbitmqUrl)
      .then(async (conn) => {
        connection = conn;
        connection.on('error', (err) => {
          console.error('[rabbitmq] connection error:', err.message);
        });
        connection.on('close', () => {
          channel = null;
          connectPromise = null;
        });

        const ch = await conn.createChannel();
        await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
        channel = ch;
        return ch;
      })
      .catch((err) => {
        console.error('[rabbitmq] no se pudo conectar:', err.message);
        connectPromise = null;
        return null;
      });
  }

  return connectPromise;
}

export async function publishEvent(routingKey, payload) {
  const ch = await ensureChannel();
  if (!ch) return false;

  const message = {
    ...payload,
    event: routingKey,
    timestamp: new Date().toISOString(),
  };

  return ch.publish(
    EXCHANGE,
    routingKey,
    Buffer.from(JSON.stringify(message)),
    {
      contentType: 'application/json',
      persistent: true,
    },
  );
}

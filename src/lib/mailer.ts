/**
 * Adaptador de correo (UC-35). En v1 solo existe el transporte de consola: las menciones se
 * registran en el log del servidor. El transporte SMTP queda preparado para producción pero
 * inactivo mientras no se configuren sus variables de entorno.
 */

export interface MentionNotification {
  /** Correo del usuario mencionado. */
  readonly to: string;
  readonly toName: string;
  /** Quien escribió el comentario. */
  readonly fromName: string;
  readonly projectName: string;
  readonly taskName: string;
  /** Ruta relativa a la tarea, por ejemplo `/projects/abc/table?task=xyz`. */
  readonly taskUrl: string;
  readonly body: string;
}

export interface Mailer {
  readonly transport: "console" | "smtp";
  sendMentionNotification(notification: MentionNotification): Promise<void>;
}

/** Asunto y cuerpo en español, compartidos por todos los transportes. */
export function renderMentionEmail(notification: MentionNotification): {
  subject: string;
  text: string;
} {
  const subject = `${notification.fromName} te mencionó en "${notification.taskName}"`;
  const text = [
    `Hola ${notification.toName}:`,
    "",
    `${notification.fromName} te mencionó en un comentario de la tarea "${notification.taskName}" ` +
      `del proyecto "${notification.projectName}".`,
    "",
    notification.body,
    "",
    `Ver la tarea: ${notification.taskUrl}`,
    "",
    "— GanttPro",
  ].join("\n");
  return { subject, text };
}

/** Transporte de desarrollo y pruebas: escribe la notificación en el log del servidor. */
export class ConsoleMailer implements Mailer {
  readonly transport = "console" as const;

  async sendMentionNotification(notification: MentionNotification): Promise<void> {
    const { subject, text } = renderMentionEmail(notification);
    console.info(
      `[correo:consola] Para: ${notification.to}\nAsunto: ${subject}\n${text}\n[fin del correo]`,
    );
  }
}

interface SmtpConfig {
  readonly host: string | undefined;
  readonly port: string | undefined;
  readonly user: string | undefined;
  readonly password: string | undefined;
  readonly from: string | undefined;
}

/**
 * Transporte SMTP preparado para producción. No se envía nada mientras falte configuración:
 * `sendMentionNotification` lanza un error descriptivo que el llamador registra sin fallar.
 *
 * TODO v2: conectar con nodemailer (SMTP propio) o Resend. Se dejó sin dependencia para no
 * arrastrar un paquete que la v1 no usa; el punto de extensión es este método.
 */
export class SmtpMailer implements Mailer {
  readonly transport = "smtp" as const;
  private readonly config: SmtpConfig;

  constructor(config: SmtpConfig = readSmtpConfigFromEnv()) {
    this.config = config;
  }

  /** Campos que faltan por configurar; vacío si el transporte está completo. */
  missingConfig(): string[] {
    const required: Array<[keyof SmtpConfig, string]> = [
      ["host", "MAIL_SMTP_HOST"],
      ["port", "MAIL_SMTP_PORT"],
      ["user", "MAIL_SMTP_USER"],
      ["password", "MAIL_SMTP_PASSWORD"],
      ["from", "MAIL_FROM"],
    ];
    return required.filter(([key]) => !this.config[key]).map(([, name]) => name);
  }

  async sendMentionNotification(notification: MentionNotification): Promise<void> {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      throw new Error(
        `El transporte SMTP no está configurado: falta ${missing.join(", ")}. ` +
          "Usa MAIL_TRANSPORT=console mientras tanto.",
      );
    }
    const { subject } = renderMentionEmail(notification);
    throw new Error(
      `El envío por SMTP no está implementado en la v1 (asunto: "${subject}"). ` +
        "Configura un proveedor de correo en el Paso de despliegue.",
    );
  }
}

function readSmtpConfigFromEnv(): SmtpConfig {
  return {
    host: process.env.MAIL_SMTP_HOST,
    port: process.env.MAIL_SMTP_PORT,
    user: process.env.MAIL_SMTP_USER,
    password: process.env.MAIL_SMTP_PASSWORD,
    from: process.env.MAIL_FROM,
  };
}

/** Transporte activo según `MAIL_TRANSPORT` (por defecto, consola). */
export function createMailer(transport = process.env.MAIL_TRANSPORT): Mailer {
  return transport === "smtp" ? new SmtpMailer() : new ConsoleMailer();
}

export const mailer: Mailer = createMailer();

/**
 * Envía la notificación sin propagar errores: una mención nunca debe hacer fallar el comentario.
 */
export async function notifyMention(
  notification: MentionNotification,
  transport: Mailer = mailer,
): Promise<void> {
  try {
    await transport.sendMentionNotification(notification);
  } catch (error) {
    console.warn(
      `No se pudo notificar la mención a ${notification.to}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

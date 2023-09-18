import * as nodemailer from "nodemailer";
import { continueRetryUntilValidation } from "./retry";

export interface Mailer {
  sendMail(to: string, subject: string, message: string): Promise<boolean>;
}

export class LinuxClubMailer implements Mailer {
  private from: string;
  private aggieMailDomain: string;

  private transporter: nodemailer.Transporter;

  constructor(
    username: string,
    password: string,
    from: string,
    aggieMailDomain: string
  ) {
    this.from = from;
    this.aggieMailDomain = aggieMailDomain;

    this.transporter = nodemailer.createTransport({
      host: "mail.linux.usu.edu",
      port: 587,
      auth: {
        user: username,
        pass: password,
      },
      requireTLS: true,
      tls: {
        rejectUnauthorized: true,
      },
    });
  }

  public async sendMail(aggie: string, subject: string, message: string) {
    const mail = {
      from: this.from,
      subject,
      html: message,
      to: `${aggie}@${this.aggieMailDomain}`,
    };

    return !!(await continueRetryUntilValidation<string>(async () => {
      const { messageId } = await this.transporter.sendMail(mail);
      return messageId;
    }));
  }
}

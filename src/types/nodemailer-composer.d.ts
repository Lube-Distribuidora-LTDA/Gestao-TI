/** O MailComposer é interno do nodemailer e não traz tipos publicados. */
declare module "nodemailer/lib/mail-composer/index.js" {
  import type { SendMailOptions } from "nodemailer";
  class MailComposer {
    constructor(mail: SendMailOptions);
    compile(): { build(): Promise<Buffer> };
  }
  export default MailComposer;
}

import { onDamageFromChat, onLinkFromChat } from "../helpers/items.mjs";

export default class Knave2eChatMessage extends ChatMessage {
  async renderHTML(options = {}) {
    const html = await super.renderHTML(options);

    html.querySelectorAll(".item-button.damage.chat").forEach(el => {
      el.addEventListener("click", onDamageFromChat.bind(this));
    });

    html.querySelectorAll(".content-link").forEach(el => {
      el.addEventListener("click", onLinkFromChat.bind(this));
    });

    return html;
  }
}
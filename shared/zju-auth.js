import "./load-env.js";

import { ZJUAM } from "login-zju";

function getZjuCredentials() {
  const username = process.env.ZJU_USERNAME;
  const password = process.env.ZJU_PASSWORD;
  if (!username || !password) {
    throw new Error("ZJU_USERNAME/ZJU_PASSWORD 未配置；请在项目根目录 .env 中设置。");
  }
  return { username, password };
}

function createZjuam() {
  const { username, password } = getZjuCredentials();
  return new ZJUAM(username, password);
}

export { createZjuam, getZjuCredentials };

# Homebridge October

Приватный Homebridge-плагин для самодельного термостата October с подключением по USB Serial.
Позволяет менять режим и целевую температуру, читать температуру и влажность встроенного и внешнего датчиков в HomeKit.

## Подключение

Нужны Node.js 22 (`.nvmrc`), Homebridge и утилита `/home/volchok/bin/october`, которая общается с устройством.
Путь к утилите и параметры опроса можно изменить в настройках плагина.

```sh
nvm use
npm ci
npm run build
npm link
```

В массив `platforms` конфигурации Homebridge добавь:

```json
{
  "platform": "October",
  "name": "October",
  "commandPath": "/home/volchok/bin/october",
  "pollInterval": 30,
  "commandTimeout": 2000
}
```

После перезапуска Homebridge плагин добавит термостат и внешний датчик температуры и влажности.
В HomeKit доступны «Нагрев» (поддержание заданной температуры) и «Выкл».
Уставка — от 10 до 30 °C с шагом 1 °C.
`pollInterval` задаётся в секундах, `commandTimeout` — в миллисекундах.

## Разработка

- `npm run lint` — проверка кода, импортов и форматирования через Biome.
- `npm run lint:fix` — форматирование и безопасные автоисправления.
- `npm run build` — сборка TypeScript в `dist/`.
- `npm test` — тесты без подключения термостата.
- `npm run watch` — сборка, локальное подключение плагина и запуск Homebridge с перезапуском при изменениях.

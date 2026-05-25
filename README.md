# Jumpboy - Desktop Game

This is the desktop version of Jumpboy. It uses **Electron** to run as a standalone Windows application.

## How to create the .exe file

Once you have downloaded this folder as a ZIP or cloned it from GitHub:

1.  **Install Node.js**: Make sure you have Node.js installed on your computer.
2.  **Open a Terminal**: Open Windows PowerShell or Command Prompt inside this folder.
3.  **Install Dependencies**: Run the following command and wait for it to finish:
    ```bash
    npm install
    ```
4.  **Build the .exe**: Run this command to create your game executable:
    ```bash
    npm run electron:build
    ```

After it finishes, you will find a new folder named `dist-electron` which contains your **Jumpboy.exe** file!

## How to play in development mode

If you want to run the app in a window without building the .exe first:
```bash
npm run electron:dev
```

# Jumpboy - Infinite Jump Game

This project contains Jumpboy, an infinite scrolling jump game.

## 🚀 Quick Play (No Setup Required)

If you downloaded this as a ZIP:
1.  Locate the **Jumpboy.html** file in this folder.
2.  Double-click it to open it in your web browser.
3.  **Play!** No installation or internet connection is required.

---

## 💻 Desktop Version (.exe)

This project also supports building a standalone Windows application using **Electron**.

### How to create the .exe file

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

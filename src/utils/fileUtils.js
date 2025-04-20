const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
const AUTH_DIR = path.join(__dirname, '..', '..', '.wwebjs_auth');



if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true }); // Use `recursive` to handle nested directories if necessary
}

const saveSessionData = (clientId, sessionData) => {
    try {
        const filePath = path.join(SESSIONS_DIR, `${clientId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2), 'utf-8');
        console.log(`Session data saved for client ${clientId}.`);
    } catch (error) {
        console.error(`Failed to save session data for client ${clientId}:`, error);
    }
};


const isSessionExists = async (sessionId) => {
    try {
        const filePath = path.join(__dirname, '..', 'sessions', `${sessionId}.json`);
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
    } catch (error) {
        // If the file doesn't exist or other errors occur
        return false;
    }
};

// const loadSessionData = (clientId) => {
//     try {
//         const filePath = path.join(SESSIONS_DIR, `${clientId}.json`);
//         return JSON.parse(fs.readFileSync(filePath));
//     } catch (error) {
//         return null;
//     }
// };

const loadSessionData = (clientId) => {
    try {
        const filePath = path.join(SESSIONS_DIR, `${clientId}.json`);
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            console.log(`Session data loaded for client ${clientId}.`);
            return data;
        } else {
            console.warn(`Session file not found for client ${clientId}.`);
            return null;
        }
    } catch (error) {
        console.error(`Failed to load session data for client ${clientId}:`, error);
        return null;
    }
};


const retryWithDelay = async (fn, retries, delay) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await fn();
            return;
        } catch (error) {
            if (attempt === retries || error.code !== 'EPERM') {
                throw error;
            }
            console.warn(`Retry ${attempt}/${retries} after ${delay}ms: ${error.message}`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
};


const destroySession = async (clientId) => {
    try {
        // Remove the session file
        const sessionFilePath = path.join(SESSIONS_DIR, `${clientId}.json`);
        if (fs.existsSync(sessionFilePath)) {
            fs.unlinkSync(sessionFilePath);
            console.log(`Session file ${sessionFilePath} deleted.`);
        }

        // Remove the session directory with retries for locked files
        const authDirPath = path.join(AUTH_DIR, `session-${clientId}`);
        if (fs.existsSync(authDirPath)) {
            await retryWithDelay(
                () => new Promise((resolve, reject) => {
                    rimraf(authDirPath, (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                }),
                5, // Max retries
                1000 // Delay (in milliseconds) between retries
            );
            console.log(`Authentication directory ${authDirPath} deleted.`);
        } else {
            console.warn(`Authentication directory ${authDirPath} not found.`);
        }
    } catch (error) {
        console.error(`Error while deleting session data for client ${clientId}:`, error);
    }
};


module.exports = { saveSessionData, isSessionExists,loadSessionData, destroySession};

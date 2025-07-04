const express = require("express");
const authJwt = require('../jwt-helper');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const moment = require('moment');

const SCHEDULE_FILE = './schedules.json';

let runtime;
let secureFnc;
let checkGroupsFnc;

let schedules = [];
let jobs = [];

async function loadSchedules() {
    try {
        const data = await fs.promises.readFile(SCHEDULE_FILE, 'utf8');
        schedules = JSON.parse(data);
        console.log('Loaded schedules from file:', schedules);
        schedules.forEach(scheduleJobs);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('No schedule file found, starting with empty schedules');
            schedules = [];
        } else {
            console.error('Error loading schedules:', err);
        }
    }
}

async function saveSchedules() {
    try {
        await fs.promises.writeFile(SCHEDULE_FILE, JSON.stringify(schedules, null, 2));
        console.log('Schedules saved to file');
    } catch (err) {
        console.error('Error saving schedules:', err);
    }
}

function scheduleJobs(schedObj) {
    if (!runtime) {
        console.error('Runtime not initialized!');
        return;
    }

    const { tagId, periods, onValue, offValue } = schedObj;

    periods.forEach(period => {
        const { dayOfWeek, startTime, endTime } = period;

        const [startHour, startMinute] = startTime.split(':');
        const startCron = `${startMinute} ${startHour} * * ${dayOfWeek}`;
        const startJob = schedule.scheduleJob(startCron, async () => {
            console.log(`Started ON period for ${tagId} at ${moment().format('YYYY-MM-DD HH:mm:ss')} with value ${onValue}`);
            try {
                const success = await runtime.devices.setTagValue(tagId, onValue);
                if (!success) {
                    console.warn(`${tagId} could not be set to ${onValue}`);
                }
            } catch (err) {
                console.error(`Error setting ${tagId} to ${onValue}:`, err);
            }
        });
        jobs.push({ name: `${tagId}-start-${dayOfWeek}`, job: startJob });

        const [endHour, endMinute] = endTime.split(':');
        const endCron = `${endMinute} ${endHour} * * ${dayOfWeek}`;
        const endJob = schedule.scheduleJob(endCron, async () => {
            console.log(`Ended OFF period for ${tagId} at ${moment().format('YYYY-MM-DD HH:mm:ss')} with value ${offValue}`);
            try {
                const success = await runtime.devices.setTagValue(tagId, offValue);
                if (!success) {
                    console.warn(`${tagId} could not be set to ${offValue}`);
                }
            } catch (err) {
                console.error(`Error setting ${tagId} to ${offValue}:`, err);
            }
        });
        jobs.push({ name: `${tagId}-end-${dayOfWeek}`, job: endJob });
    });
}

async function applyCurrentStates() {
    if (!runtime) {
        console.error('Runtime not initialized!');
        return;
    }

    const now = moment();
    for (const schedule of schedules) {
        const { tagId, periods, onValue, offValue } = schedule;
        const isOn = periods.some(p => {
            const today = now.day();
            if (parseInt(p.dayOfWeek) !== today) return false;

            const start = moment(p.startTime, 'HH:mm');
            const end = moment(p.endTime, 'HH:mm');
            const nowTime = moment(now.format('HH:mm'), 'HH:mm');

            return nowTime.isBetween(start, end);
        });

        try {
            const value = isOn ? onValue : offValue;
            const success = await runtime.devices.setTagValue(tagId, value);
            if (success) {
                console.log(`Set ${tagId} to ${value} based on current time`);
            } else {
                console.warn(`Could not set ${tagId} to ${value}`);
            }
        } catch (err) {
            console.error(`Error setting ${tagId} to ${value}:`, err);
        }
    }
}

function createApp() {
    const commandApp = express();

    commandApp.use((req, res, next) => {
        if (!runtime?.project) {
            res.status(404).end();
        } else {
            next();
        }
    });

    // POST - create schedule
    commandApp.post('/api/schedules', async (req, res) => {
        const { tagId, name, periods, onValue, offValue, timeFormat } = req.body;

        if (!tagId || !Array.isArray(periods) || !onValue || !offValue || !timeFormat) {
            return res.status(400).json({ error: 'tagId, periods, onValue, offValue, and timeFormat are required' });
        }

        jobs = jobs.filter(job => !job.name.startsWith(tagId));
        schedules = schedules.filter(sch => sch.tagId !== tagId);

        const newSchedule = { tagId, name: name || '', periods, onValue, offValue, timeFormat };
        schedules.push(newSchedule);
        scheduleJobs(newSchedule);
        await saveSchedules();
        await applyCurrentStates(); // Apply immediately after creating new schedule

        res.json({ message: 'Schedule created', schedule: newSchedule });
    });

    // PUT - update schedule
    commandApp.put('/api/schedules/:tagId', async (req, res) => {
        const tagId = req.params.tagId;
        const { name, periods, onValue, offValue, timeFormat } = req.body;

        if (!Array.isArray(periods) || !onValue || !offValue || !timeFormat) {
            return res.status(400).json({ error: 'Invalid periods, onValue, offValue, or timeFormat format' });
        }

        jobs = jobs.filter(job => !job.name.startsWith(tagId));
        schedules = schedules.filter(s => s.tagId !== tagId);

        const updatedSchedule = { tagId, name: name || '', periods, onValue, offValue, timeFormat };
        schedules.push(updatedSchedule);
        scheduleJobs(updatedSchedule);
        await saveSchedules();
        await applyCurrentStates(); // Apply immediately after updating

        res.json({ message: 'Schedule updated', schedule: updatedSchedule });
    });

    // DELETE - remove schedule
    commandApp.delete('/api/schedules/:tagId', async (req, res) => {
        const tagId = req.params.tagId;

        jobs = jobs.filter(job => {
            const match = job.name.startsWith(tagId);
            if (match && job.job) job.job.cancel();
            return !match;
        });

        schedules = schedules.filter(s => s.tagId !== tagId);
        await saveSchedules();

        res.json({ message: 'Schedule deleted', tagId });
    });

    // GET - return all schedules with current status
    commandApp.get('/api/schedules', (req, res) => {
        const now = moment();
        const status = schedules.map(s => {
            const isOn = s.periods.some(p => {
                const today = now.day();
                if (parseInt(p.dayOfWeek) !== today) return false;

                const start = moment(p.startTime, 'HH:mm');
                const end = moment(p.endTime, 'HH:mm');
                const nowTime = moment(now.format('HH:mm'), 'HH:mm');

                return nowTime.isBetween(start, end);
            });
            return { ...s, isOn };
        });
        res.json(status);
    });

    return commandApp;
}

module.exports = {
    init: async function (_runtime, _secureFnc, _checkGroupsFnc) {
        runtime = _runtime;
        secureFnc = _secureFnc;
        checkGroupsFnc = _checkGroupsFnc;

        await loadSchedules();

        // Wait some time before loading tags
        setTimeout(async () => {
            await applyCurrentStates();
        }, 5000); // ms delay
    },
    app: createApp
};
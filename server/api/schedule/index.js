/**
 * Schedules API: Manage schedules
 */

'use strict';

const express = require("express");
const authJwt = require('../jwt-helper');
const schedule = require('node-schedule');
const moment = require('moment');

let Holidays;
let hd;
let holidayError = false;

// Try to load date-holidays, the idea is that schedule should work without.
// If this fail we disable the skipp holiday slider in the frontend.
try {
    Holidays = require('date-holidays');    
} catch (err) {
    console.warn('[WARNING] Could not load date holidays - holiday check disabled.');
    hd = null; // fallback
	holidayError = true;
}

var runtime;
var secureFnc;
var checkGroupsFnc;

let schedules = [];
let jobs = [];
//var utils = require('../../runtime/utils');

/**
 * Load schedules from FUXA project storage
 */
async function loadSchedules() {
    try {
        schedules = await runtime.project.getSchedules();
		//locationZ = await runtime.project.getProject();
		//console.log(locationZ);
        console.log('Loaded schedules from project storage:', schedules);
        schedules.forEach(scheduleJobs);
    } catch (err) {
        console.error('Error loading schedules from project storage:', err);
        schedules = [];
    }
}


/**
 * Save schedules to FUXA project storage
 */
async function saveSchedules() {
    try {
        const { ProjectDataCmdType } = runtime.project;
        for (const sched of schedules) {
            await runtime.project.setProjectData(ProjectDataCmdType.SetSchedule, sched);
        }
        console.log('Schedules saved to project storage');
    } catch (err) {
        console.error('Error saving schedules to project storage:', err);
        throw err;
    }
}


/**
 * Schedule jobs for a given schedule object
 * @param {Object} schedObj - The schedule object
 */
 
// Function to schedule jobs and apply current states
function scheduleJobs(schedObj) {
    if (!runtime) {
        console.error('Error Schedule runtime not initialized!');
        return;
    }

    // Not so elegant solution, we need to wait some time, this function also runs on start and getProject() is not ready yet
    // The location is retrieved from "project" -> "mapsLocations" -> "name" for now,
    // perhaps need a more user-friendly option for that.
    setTimeout(() => {

        runtime.project.getProject().then(async project => {
            const locationName = project.mapsLocations?.[0]?.name;
			
            // Initialize Holidays with location
            let hd;
            if (locationName) {
				try {
					const hd = new Holidays(locationName);
					console.log('Date-holiday country:', hd.getCountries()[locationName]);
					console.log('Date-holiday language:', hd.getLanguages());
				} catch (error) {
					console.warn('[WARNING] Could not load date holidays - holiday check disabled.');
					holidayError = true;
				}
            } else {
                hd = null; // Explicitly set to null if locationName missing
                console.error('Error Location name not found in project');
                holidayError = true; // For disable the frontend togle button
            }
			
			const today = new Date();
			//const today = new Date(1744971830000)
            // Example: Log holidays for 2025 (for debugging)
            // console.log('Holidays:', hd.getHolidays(2025, { types: ['public', 'bank'] }));

            const { tagId, periods, onValue, offValue, skippHolidays } = schedObj;
			
			// Check if today is a holiday, only for 'public' and 'bank' holidays
			const isHoliday = hd && skippHolidays
				? hd.isHoliday(today, { types: ['public', 'bank'] }) // Filter by holiday type
				: false;

            // Schedule jobs
            periods.forEach(period => {
                const { dayOfWeek, startTime, endTime } = period;

                const [startHour, startMinute] = startTime.split(':');
                const startCron = `${startMinute} ${startHour} * * ${dayOfWeek}`;

                const startJob = schedule.scheduleJob(startCron, async () => {

                    if (isHoliday) {
                        console.log(`[SKIPPED] ${tagId} – It's a holiday (${today.toDateString()}), ON skipping.`);
                        return;
                    }

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

                // OFF job
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

            // Apply current states
            const now = moment();
            const isOn = periods.some(p => {
                const today = now.day();
                if (parseInt(p.dayOfWeek) !== today) return false;

                const start = moment(p.startTime, 'HH:mm');
                const end = moment(p.endTime, 'HH:mm');
                const nowTime = moment(now.format('HH:mm'), 'HH:mm');

                return nowTime.isBetween(start, end);
            });

			try {
				if (isOn && isHoliday) {
					console.log(`Skipped setting ${tagId} to ON because it's a holiday`);
					return;
				}

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
        });
    }, 2000);
}


/**
 * Apply current states based on schedule periods (Moved) 
 */
 
/* async function applyCurrentStates() {
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
} */

/**
 * Create Express app for schedule endpoints
 */
function createApp() {
    const commandApp = express();

    // Middleware: Check that runtime is initialized
    commandApp.use((req, res, next) => {
        if (!runtime?.project) {
            res.status(404).end();
        } else {
            next();
        }
    });

    // Helper function: Check admin permission
    function requireAdmin(req, res) {
        const permission = checkGroupsFnc(req);

        if (res.statusCode === 403) {
            runtime.logger.error("Token expired");
            res.status(403).json({ error: "token_expired", message: "Token expired" });
            return false;
        }

        if (!authJwt.haveAdminPermission(permission)) {
            runtime.logger.error("Unauthorized access");
            res.status(401).json({ error: "unauthorized_error", message: "Unauthorized!" });
            return false;
        }

        return true;
    }

    // POST - Create new schedule
    commandApp.post('/api/schedules', secureFnc, async (req, res) => {
        if (!requireAdmin(req, res)) return;

        const { tagId, name, periods, onValue, offValue, timeFormat, skippHolidays } = req.body;

        if (!tagId || !Array.isArray(periods) || !onValue || !offValue || !timeFormat) {
            return res.status(400).json({ error: 'tagId, periods, onValue, offValue, and timeFormat are required' });
        }

        jobs = jobs.filter(job => !job.name.startsWith(tagId));
        schedules = schedules.filter(sch => sch.tagId !== tagId);

        const newSchedule = { tagId, name: name || '', periods, onValue, offValue, timeFormat, skippHolidays };
        schedules.push(newSchedule);
        scheduleJobs(newSchedule);
        try {
            await saveSchedules();
            //await applyCurrentStates();
            res.json({ message: 'Schedule created', schedule: newSchedule });
        } catch (err) {
            res.status(500).json({ error: 'server_error', message: err.message });
            runtime.logger.error(`api post schedules: ${err.message}`);
        }
    });

    // PUT - Update schedule
    commandApp.put('/api/schedules/:tagId', secureFnc, async (req, res) => {
        if (!requireAdmin(req, res)) return;

        const tagId = req.params.tagId;
        const { name, periods, onValue, offValue, timeFormat, skippHolidays } = req.body;

        if (!Array.isArray(periods) || !onValue || !offValue || !timeFormat) {
            return res.status(400).json({ error: 'Invalid periods, onValue, offValue, or timeFormat format' });
        }

        jobs = jobs.filter(job => !job.name.startsWith(tagId));
        schedules = schedules.filter(s => s.tagId !== tagId);

        const updatedSchedule = { tagId, name: name || '', periods, onValue, offValue, timeFormat, skippHolidays };
        schedules.push(updatedSchedule);
        scheduleJobs(updatedSchedule);
        try {
            await saveSchedules();
            //await applyCurrentStates();
            res.json({ message: 'Schedule updated', schedule: updatedSchedule });
        } catch (err) {
            res.status(500).json({ error: 'server_error', message: err.message });
            runtime.logger.error(`api put schedules: ${err.message}`);
        }
    });

    // DELETE - Remove schedule
    commandApp.delete('/api/schedules/:tagId', secureFnc, async (req, res) => {
        if (!requireAdmin(req, res)) return;

        const tagId = req.params.tagId;

        jobs = jobs.filter(job => {
            const match = job.name.startsWith(tagId);
            if (match && job.job) job.job.cancel();
            return !match;
        });

        schedules = schedules.filter(s => s.tagId !== tagId);
        try {
            const { ProjectDataCmdType } = runtime.project;
            await runtime.project.setProjectData(ProjectDataCmdType.DelSchedule, { tagId });
            res.json({ message: 'Schedule deleted', tagId });
        } catch (err) {
            res.status(500).json({ error: 'server_error', message: err.message });
            runtime.logger.error(`api delete schedules: ${err.message}`);
        }
    });

    // GET - Retrieve all schedules with status
    commandApp.get('/api/schedules', secureFnc, async (req, res) => {
        if (!requireAdmin(req, res)) return;

        try {
            const now = moment();
            const status = schedules.map(s => {
                const isOn = s.periods.some(p => {
                    const today = now.day();
                    if (parseInt(p.dayOfWeek) !== today) return false;

                    const start = moment(p.startTime, 'HH:mm');
                    const end = moment(p.endTime, 'HH:mm');
                    const nowTime = moment(now.format('HH:mm'), 'HH:mm');

                    return nowTime.isBetween(start, end, null, '[)');
                });
                return { ...s, isOn, error: holidayError };
            });

            res.json(status);
        } catch (err) {
            res.status(500).json({ error: 'server_error', message: err.message });
            runtime.logger.error(`api get schedules: ${err.message}`);
        }
    });

    return commandApp;
}

module.exports = {
    init: async function (_runtime, _secureFnc, _checkGroupsFnc) {
        runtime = _runtime;
        secureFnc = _secureFnc;
        checkGroupsFnc = _checkGroupsFnc;

        await loadSchedules();
		//await loadLocation();
        // Wait some time before loading tags
        //setTimeout(async () => {
            //await applyCurrentStates();
        //}, 5000); // ms delay
    },
    app: createApp
};
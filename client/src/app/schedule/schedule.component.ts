import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatLegacyDialog as MatDialog } from '@angular/material/legacy-dialog';
import { ScheduleDialogComponent } from './schedule-dialog.component';
import { AddScheduleDialogComponent } from './add-schedule-dialog.component';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../_services/auth.service';
import { ToastNotifierService } from '../_services/toast-notifier.service';
import { ProjectService } from '../_services/project.service';

// To fix:
// The api on backend needs admin permission for connection but we need to be able to show current schedules 
// and change the periods without full admin permissions, for now we need admin permissions to use the schedule.
// We only want to use admin permissions to add a new schedule not to show.
// Solution, Get rid of the api and communicate via socket instead ? 
// Save in fuxa project. For know we save in a json file in fuxa server root.
// Time conversions: PM/AM time conversions need more work.

// Info
// Wen running client mode we need to add http://localhost:1881 for the api connections below

interface Schedule {
    tagId: string;
    name: string;
    tagName?: string;
    periods: { dayOfWeek: string; startTime: string; endTime: string }[];
    isOn: boolean;
    onValue: string;
    offValue: string;
    timeFormat: '24h' | '12h';
}

@Component({
    selector: 'app-schedule',
    templateUrl: './schedule.component.html',
    styleUrls: ['./schedule.component.scss']
})
export class ScheduleComponent implements OnInit {

		
    schedules: Schedule[] = [];
    displayedColumns: string[] = ['select', 'name', 'tagName', 'tagId', 'periods', 'status', 'actions'];

    constructor(
        private http: HttpClient,
        private dialog: MatDialog,
        private translateService: TranslateService,
        private authService: AuthService,
        private projectService: ProjectService,
		private toastNotifier: ToastNotifierService,
    ) {
        console.log('MatDialog:', this.dialog);
    }

    getDeviceTagName(tagId: string): string {
        console.log('tag name: ', this.projectService.getTagFromId(tagId)?.name);
        return this.projectService.getTagFromId(tagId)?.name || 'Unknown Tag';
    }

    goBack(): void {
        window.history.back();
        // this.router.navigate(['/previous-page']);
    }

    ngOnInit() {
		// Permission check (only for remind user if not admin)
        const context = {
            permission: 2056 // show and edit group 3 ? 
        };

        // Run the permission check.
        const permission = this.authService.checkPermission(context);

        console.log('Permission check for AddScheduleDialog:', permission);

        if (!permission.show) {
            this.toastNotifier.notifyError(this.translateService.instant('msg.operation-unauthorized'));
            return;
        }
		// Permission pass move on..
		
        this.loadSchedules();
    }

    deleteSchedule(tagId: string) {
        if (confirm(`Do you really want to delete the schedule for ${tagId}?`)) {
            console.log('Deleting schedule with tagId:', tagId);
            this.http.delete(`/api/schedules/${tagId}`).subscribe({
                next: () => this.loadSchedules(),
                error: (err) => console.error('Error deleting schedule:', err)
            });
        }
    }

    loadSchedules() {
        this.http.get<Schedule[]>('/api/schedules').subscribe({
            next: (schedules) => {
                this.schedules = schedules;
            },
            error: (err) => console.error('Error loading schedules:', err)
        });
    }

    openAddScheduleDialog() {
		// Permission check
        const context = {
            permission: 2056 // show and edit group 3 ? 
        };

        // Run the permission check.
        const permission = this.authService.checkPermission(context);

        console.log('Permission check for AddScheduleDialog:', permission);

        if (!permission.show) {
            this.toastNotifier.notifyError(this.translateService.instant('msg.operation-unauthorized')); //alert('No permission, log on as admin');
            return;
        }
		// Permission pass move on..
		
        // Open the dialog and pass the isReadonly flag based on whether enabled is false.
        const dialogRef = this.dialog.open(AddScheduleDialogComponent, {
            width: '600px',
            data: { 
                tagId: '', 
                name: '', 
                periods: [], 
                onValue: 'on',
                offValue: 'off',
                timeFormat: '24h',
                isReadonly: !permission.enabled
            },
            autoFocus: true,
            hasBackdrop: true,
            disableClose: false
        });

        dialogRef.afterClosed().subscribe(result => {
            console.log('Dialog closed with result:', result);

            // Only save if the user has edit permissions.
            if (result && permission.enabled) {
                this.http.post('/api/schedules', result).subscribe({
                    next: () => this.loadSchedules(),
                    error: (err) => console.error('Error saving schedule:', err)
                });
            } else if (result && !permission.enabled) {
                console.warn('You do not have permission to save changes.');
            }
        });
    }

    editSchedule(schedule: Schedule) {
        const dialogRef = this.dialog.open(ScheduleDialogComponent, {
            width: '600px',
            data: {
                tagId: schedule.tagId,
                name: schedule.name,
                periods: schedule.periods,
                onValue: schedule.onValue,
                offValue: schedule.offValue,
                timeFormat: schedule.timeFormat
            },
            autoFocus: true
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.http.put(`/api/schedules/${schedule.tagId}`, result).subscribe({
                    next: () => this.loadSchedules(),
                    error: (err) => console.error('Error updating schedule:', err)
                });
            }
        });
    }

    getDayName(dayOfWeek: string): string {
        const dayIndex = parseInt(dayOfWeek);
        const dayKeys = [
            'schedule-day-sunday',
            'schedule-day-monday',
            'schedule-day-tuesday',
            'schedule-day-wednesday',
            'schedule-day-thursday',
            'schedule-day-friday',
            'schedule-day-saturday'
        ];
        return this.translateService.instant(dayKeys[dayIndex]) || 'Unknown';
    }

    // Format time for display based on schedule's timeFormat setting
    formatTime(time: string, timeFormat: '24h' | '12h'): string {
        if (timeFormat === '12h') {
            try {
                const [hours, minutes] = time.split(':').map(Number);
                if (isNaN(hours) || isNaN(minutes) || hours > 23 || minutes > 59) {
                    throw new Error('Invalid time format');
                }
                const period = hours >= 12 ? 'PM' : 'AM';
                const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
                return `${displayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`;
            } catch (e) {
                console.error('Error formatting time:', e);
                return time;
            }
        }
        return time;
    }
}
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatLegacyDialog as MatDialog } from '@angular/material/legacy-dialog';
import { ScheduleDialogComponent } from './schedule-dialog.component';
import { TranslateService } from '@ngx-translate/core';

interface Schedule {
    tagId: string;
    name: string;
    periods: { dayOfWeek: string; startTime: string; endTime: string }[];
    isOn: boolean;
}

@Component({
    selector: 'app-schedule',
    templateUrl: './schedule.component.html',
    styleUrls: ['./schedule.component.scss']
})
export class ScheduleComponent implements OnInit {
    schedules: Schedule[] = [];
    displayedColumns: string[] = ['name', 'tagId', 'periods', 'status', 'actions'];

    constructor(
        private http: HttpClient,
        private dialog: MatDialog,
        private translateService: TranslateService
    ) {
        console.log('MatDialog:', this.dialog); // Log
    }

    goBack(): void {
        window.history.back();
        // this.router.navigate(['/previous-page']);
    }

    ngOnInit() {
        this.loadSchedules();
    }

    deleteSchedule(tagId: string) {
        if (confirm(`Do you really want to delete the schedule for ${tagId}?`)) {
            console.log('Deleting schedule with tagId:', tagId);
            this.http.delete(`http://localhost:1881/api/schedules/${tagId}`).subscribe({
                next: () => this.loadSchedules(),
                error: (err) => console.error('Error deleting schedule:', err)
            });
        }
    }

    loadSchedules() {
        this.http.get<Schedule[]>('http://localhost:1881/api/schedules').subscribe({
            next: (schedules) => {
                this.schedules = schedules;
            },
            error: (err) => console.error('Error loading schedules:', err)
        });
    }

    openScheduleDialog() {
        console.log('Opening ScheduleDialogComponent'); // Log to verify
        const dialogRef = this.dialog.open(ScheduleDialogComponent, {
            width: '600px',
            data: { tagId: '', name: '', periods: [] },
            autoFocus: true, // Ensure focus on the first element
            hasBackdrop: true, // Ensure that the background is displayed
            disableClose: false // Allow closing with ESC or outside clicks
        });

        dialogRef.afterClosed().subscribe(result => {
            console.log('Dialog closed with result:', result); // Log to verify
            if (result) {
                this.http.post('http://localhost:1881/api/schedules', result).subscribe({
                    next: () => this.loadSchedules(),
                    error: (err) => console.error('Error saving schedule:', err)
                });
            }
        });
    }

    editSchedule(schedule: Schedule) {
        const dialogRef = this.dialog.open(ScheduleDialogComponent, {
            width: '600px',
            data: {
                tagId: schedule.tagId,
                name: schedule.name,
                periods: schedule.periods
            },
            autoFocus: true
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.http.put(`http://localhost:1881/api/schedules/${schedule.tagId}`, result).subscribe({
                    next: () => this.loadSchedules(),
                    error: (err) => console.error('Error updating schedule:', err)
                });
            }
        });
    }

    getDayName(dayOfWeek: string): string {
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        return days[parseInt(dayOfWeek)] || 'Unknown';
    }
}

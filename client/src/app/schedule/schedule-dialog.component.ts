import { Component, Inject } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, FormArray, Validators } from '@angular/forms';
import { MatLegacyDialogRef as MatDialogRef, MAT_LEGACY_DIALOG_DATA } from '@angular/material/legacy-dialog';
import { TranslateService } from '@ngx-translate/core';

interface Period {
    dayOfWeek: string;
    startTime: string;
    endTime: string;
}

interface ScheduleData {
    tagId: string;
    name: string;
    periods: Period[];
    onValue: string;
    offValue: string;
    timeFormat: '24h' | '12h';
}

@Component({
    selector: 'app-schedule-dialog',
    templateUrl: './schedule-dialog.component.html',
    styleUrls: ['./schedule-dialog.component.css']
})
export class ScheduleDialogComponent {
    formGroup: UntypedFormGroup;
    daysOfWeek: { value: string; name: string }[] = [];
    // Store non-editable fields to include in the submitted data
    scheduleData: ScheduleData;

    constructor(
        private fb: UntypedFormBuilder,
        public dialogRef: MatDialogRef<ScheduleDialogComponent>,
        @Inject(MAT_LEGACY_DIALOG_DATA) public data: ScheduleData,
        private translateService: TranslateService
    ) {
        this.scheduleData = data;
        this.daysOfWeek = [
            { value: '1', name: this.translateService.instant('schedule-day-monday') },
            { value: '2', name: this.translateService.instant('schedule-day-tuesday') },
            { value: '3', name: this.translateService.instant('schedule-day-wednesday') },
            { value: '4', name: this.translateService.instant('schedule-day-thursday') },
            { value: '5', name: this.translateService.instant('schedule-day-friday') },
            { value: '6', name: this.translateService.instant('schedule-day-saturday') },
            { value: '0', name: this.translateService.instant('schedule-day-sunday') }
        ];

        this.formGroup = this.fb.group({
            periods: this.fb.array([])
        });

        if (data?.periods?.length) {
            data.periods.forEach(period => this.addPeriod(period));
        } else {
            this.addPeriod();
        }
    }

    get periods() {
        return this.formGroup.get('periods') as FormArray;
    }

    addPeriod(period?: Period) {
        const periodGroup = this.fb.group({
            dayOfWeek: [period?.dayOfWeek || '0', Validators.required],
            startTime: [
                period?.startTime || '08:00',
                [Validators.required, Validators.pattern(/^\d{2}:\d{2}$/)]
            ],
            endTime: [
                period?.endTime || '16:00',
                [Validators.required, Validators.pattern(/^\d{2}:\d{2}$/)]
            ]
        });
        this.periods.push(periodGroup);
    }

    removePeriod(index: number) {
        this.periods.removeAt(index);
    }

    // Format time for display based on timeFormat
    formatTime(time: string): string {
        if (this.scheduleData.timeFormat === '12h') {
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

    // Parse time from input to 24-hour format (HH:mm)
    parseTime(time: string): string {
        if (this.scheduleData.timeFormat === '12h') {
            try {
                // Match formats like "12:34 AM", "1:23PM", "01:23 pm", etc.
                const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
                if (!match) {
                    throw new Error('Invalid 12-hour time format');
                }
                let [_, hours, minutes, period] = match;
                let hoursNum = parseInt(hours, 10);
                const minutesNum = parseInt(minutes, 10);
                if (hoursNum < 1 || hoursNum > 12 || minutesNum > 59) {
                    throw new Error('Invalid time values');
                }
                if (period.toUpperCase() === 'PM' && hoursNum !== 12) {
                    hoursNum += 12;
                } else if (period.toUpperCase() === 'AM' && hoursNum === 12) {
                    hoursNum = 0;
                }
                return `${hoursNum.toString().padStart(2, '0')}:${minutesNum.toString().padStart(2, '0')}`;
            } catch (e) {
                console.error('Error parsing time:', e);
                return time;
            }
        }
        return time;
    }

    onCancel() {
        this.dialogRef.close();
    }

    onSave() {
        if (this.formGroup.valid) {
            // Convert times back to 24-hour format for submission
            const periods = this.formGroup.value.periods.map(period => ({
                dayOfWeek: period.dayOfWeek,
                startTime: this.parseTime(period.startTime),
                endTime: this.parseTime(period.endTime)
            }));
            // Include non-editable fields in the submitted data
            const result = {
                tagId: this.scheduleData.tagId,
                name: this.scheduleData.name,
                periods,
                onValue: this.scheduleData.onValue,
                offValue: this.scheduleData.offValue,
                timeFormat: this.scheduleData.timeFormat
            };
            console.log('ScheduleDialog result:', result); // Log to verify result
            this.dialogRef.close(result);
        }
    }
}
import { Component, Inject } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { MatLegacyDialogRef as MatDialogRef, MAT_LEGACY_DIALOG_DATA, MatLegacyDialog } from '@angular/material/legacy-dialog';
import { DeviceTagSelectionComponent, DeviceTagSelectionData } from '../device/device-tag-selection/device-tag-selection.component';
import { ScheduleDialogComponent } from './schedule-dialog.component';
import { TranslateService } from '@ngx-translate/core';

interface ScheduleData {
    tagId: string;
    name: string;
    periods: { dayOfWeek: string; startTime: string; endTime: string }[];
    onValue: string;
    offValue: string;
    timeFormat: '24h' | '12h';
}

@Component({
    selector: 'app-add-schedule-dialog',
    templateUrl: './add-schedule-dialog.component.html',
    styleUrls: ['./add-schedule-dialog.component.css']
})
export class AddScheduleDialogComponent {
    formGroup: UntypedFormGroup;
    timeFormats: { value: '24h' | '12h'; name: string }[] = [];

    constructor(
        private fb: UntypedFormBuilder,
        public dialogRef: MatDialogRef<AddScheduleDialogComponent>,
        @Inject(MAT_LEGACY_DIALOG_DATA) public data: ScheduleData,
        private dialog: MatLegacyDialog,
        private translateService: TranslateService
    ) {
        this.timeFormats = [
            { value: '24h', name: this.translateService.instant('schedule-time-format-24h') },
            { value: '12h', name: this.translateService.instant('schedule-time-format-12h') }
        ];

        this.formGroup = this.fb.group({
            tagId: [data?.tagId || '', Validators.required],
            name: [data?.name || '', Validators.required],
            onValue: [data?.onValue || 'on', [Validators.required, Validators.minLength(1)]],
            offValue: [data?.offValue || 'off', [Validators.required, Validators.minLength(1)]],
            timeFormat: [data?.timeFormat || '24h', Validators.required]
        });
    }

    openTagSelection() {
        const dialogRef = this.dialog.open(DeviceTagSelectionComponent, {
            disableClose: true,
            position: { top: '60px' },
            data: <DeviceTagSelectionData>{
                variableId: null,
                multiSelection: false,
                deviceFilter: [],
                isHistorical: false
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            console.log(result); // Log to verify result
            if (result && result.variableId) {
                this.formGroup.get('tagId')?.setValue(result.variableId);
            }
        });
    }

    onCancel() {
        this.dialogRef.close();
    }

    onSave() {
        if (this.formGroup.valid) {
            const formData = { ...this.formGroup.value, periods: [] };
            // Open ScheduleDialogComponent to add periods
            const scheduleDialogRef = this.dialog.open(ScheduleDialogComponent, {
                width: '600px',
                data: formData,
                autoFocus: true
            });

            // Handle the result from ScheduleDialogComponent
            scheduleDialogRef.afterClosed().subscribe(result => {
                if (result) {
                    // Return the combined result to the parent component
                    this.dialogRef.close(result);
                } else {
                    // If no result (e.g., canceled), close without returning data
                    this.dialogRef.close();
                }
            });
        }
    }
}
import { Component, Inject } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, FormArray, Validators } from '@angular/forms';
import { MatLegacyDialogRef as MatDialogRef, MAT_LEGACY_DIALOG_DATA, MatLegacyDialog } from '@angular/material/legacy-dialog';
import { DeviceTagSelectionComponent, DeviceTagSelectionData } from '../device/device-tag-selection/device-tag-selection.component';
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
}

@Component({
  selector: 'app-schedule-dialog',
  templateUrl: './schedule-dialog.component.html',
  styleUrls: ['./schedule-dialog.component.css']
})
export class ScheduleDialogComponent {
  formGroup: UntypedFormGroup;
  daysOfWeek: { value: string; name: string }[] = [];

  constructor(
    private fb: UntypedFormBuilder,
    public dialogRef: MatDialogRef<ScheduleDialogComponent>,
    @Inject(MAT_LEGACY_DIALOG_DATA) public data: ScheduleData,
    private dialog: MatLegacyDialog,
    private translateService: TranslateService
  ) {
    // Dynamiskt hämta översatta veckodagsnamn
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
      tagId: [data?.tagId || ''],
      name: [data?.name || '', Validators.required],
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
      startTime: [period?.startTime || '08:00', [Validators.required, Validators.pattern(/^\d{2}:\d{2}$/)]],
      endTime: [period?.endTime || '16:00', [Validators.required, Validators.pattern(/^\d{2}:\d{2}$/)]]
    });
    this.periods.push(periodGroup);
  }

  removePeriod(index: number) {
    this.periods.removeAt(index);
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
      this.dialogRef.close(this.formGroup.value);
    }
  }
}

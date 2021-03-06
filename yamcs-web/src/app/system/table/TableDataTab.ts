import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Observable } from 'rxjs/Observable';

import { Table, Record } from '../../../yamcs-client';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';

import { ActivatedRoute } from '@angular/router';

import { YamcsService } from '../../core/services/YamcsService';

@Component({
  templateUrl: './TableDataTab.html',
  styleUrls: ['./TableDataTab.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableDataTab {

  table$: Observable<Table>;
  records$: Observable<Record[]>;

  selectedRecord$ = new BehaviorSubject<Record | null>(null);

  constructor(route: ActivatedRoute, yamcs: YamcsService) {
    const parent = route.snapshot.parent;
    if (parent) {
      const name = parent.paramMap.get('name');
      if (name) {
        this.table$ = yamcs.getSelectedInstance().getTable(name);
        this.records$ = yamcs.getSelectedInstance().getTableData(name);
      }
    }
  }

  getColumnValue(record: Record, columnName: string) {
    for (const column of record.column) {
      if (column.name === columnName) {
        return column.value;
      }
    }
    return null;
  }

  selectRecord(record: Record) {
    this.selectedRecord$.next(record);
  }
}

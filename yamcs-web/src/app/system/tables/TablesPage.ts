import { Component, ChangeDetectionStrategy, ViewChild, AfterViewInit, OnInit } from '@angular/core';

import { Table, Instance } from '../../../yamcs-client';

import { YamcsService } from '../../core/services/YamcsService';
import { MatTableDataSource, MatSort } from '@angular/material';
import { Observable } from 'rxjs/Observable';
import { Store } from '@ngrx/store';
import { State } from '../../app.reducers';
import { selectCurrentInstance } from '../../core/store/instance.selectors';

@Component({
  templateUrl: './TablesPage.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TablesPage implements OnInit, AfterViewInit {

  @ViewChild(MatSort)
  sort: MatSort;

  instance$: Observable<Instance>;

  displayedColumns = ['name'];

  dataSource = new MatTableDataSource<Table>();

  constructor(yamcs: YamcsService, private store: Store<State>) {
    yamcs.getSelectedInstance().getTables().subscribe(tables => {
      this.dataSource.data = tables;
    });
  }

  ngOnInit() {
    this.instance$ = this.store.select(selectCurrentInstance);
  }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
  }
}

// PocketBase-backed drop-in for the small Supabase subset this app uses.
// createPBClient(url) returns an `sb`-like object: sb.from(table)…chain…, plus sb.auth.
// Table names groups->monster_groups; field names user_id<->user, group_id<->group,
// parent_id<->parent are translated both ways. Every query resolves to { data, error }
// (never rejects) so the original call sites work unchanged.
(function (global) {
	var TABLE_MAP = { groups: 'monster_groups', monsters: 'monsters' };
	var APP_TO_PB = { user_id: 'user', group_id: 'group', parent_id: 'parent' };
	var PB_TO_APP = { user: 'user_id', group: 'group_id', parent: 'parent_id' };
	var RELATION = { user: 1, group: 1, parent: 1 };

	function toPbField(col) {
		return APP_TO_PB[col] || col;
	}

	function toPbPayload(obj) {
		var out = {};
		for (var k in obj) {
			if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
			var pk = APP_TO_PB[k] || k;
			var v = obj[k];
			if (RELATION[pk] && (v === null || v === undefined)) v = ''; // empty single-relation
			out[pk] = v;
		}
		return out;
	}

	function toAppRecord(rec) {
		if (!rec) return rec;
		var out = {};
		for (var k in rec) {
			if (Object.prototype.hasOwnProperty.call(rec, k)) out[k] = rec[k];
		}
		for (var pk in PB_TO_APP) {
			if (Object.prototype.hasOwnProperty.call(rec, pk)) {
				out[PB_TO_APP[pk]] = rec[pk] === '' ? null : rec[pk];
			}
		}
		return out;
	}

	function PBQuery(pb, collection) {
		this.pb = pb;
		this.collection = collection;
		this._op = 'select';
		this._payload = null;
		this._filters = [];
		this._sort = null;
		this._single = false;
	}
	var P = PBQuery.prototype;
	P.select = function () {
		return this;
	}; // projection ignored — we always return the full record
	P.insert = function (obj) {
		this._op = 'insert';
		this._payload = obj;
		return this;
	};
	P.update = function (obj) {
		this._op = 'update';
		this._payload = obj;
		return this;
	};
	P.delete = function () {
		this._op = 'delete';
		return this;
	};
	P.eq = function (col, val) {
		this._filters.push({ col: col, op: 'eq', val: val });
		return this;
	};
	P.in = function (col, arr) {
		this._filters.push({ col: col, op: 'in', val: arr });
		return this;
	};
	P.order = function (col) {
		this._sort = col;
		return this;
	};
	P.single = function () {
		this._single = true;
		return this;
	};
	P.then = function (onF, onR) {
		return this._exec().then(onF, onR);
	};
	P.catch = function (onR) {
		return this._exec().catch(onR);
	};

	P._buildFilter = function () {
		var pb = this.pb,
			parts = [],
			params = {},
			n = 0;
		for (var i = 0; i < this._filters.length; i++) {
			var f = this._filters[i],
				col = toPbField(f.col);
			if (f.op === 'eq') {
				var key = 'p' + n++;
				params[key] = f.val;
				parts.push(col + ' = {:' + key + '}');
			} else if (f.op === 'in') {
				var ors = [];
				for (var j = 0; j < f.val.length; j++) {
					var k2 = 'p' + n++;
					params[k2] = f.val[j];
					ors.push(col + ' = {:' + k2 + '}');
				}
				parts.push('(' + (ors.join(' || ') || 'id = "__none__"') + ')');
			}
		}
		return parts.length ? pb.filter(parts.join(' && '), params) : '';
	};

	// the single id value when the only filter is eq('id', X); else null
	P._idFilter = function () {
		if (this._filters.length === 1 && this._filters[0].col === 'id' && this._filters[0].op === 'eq')
			return this._filters[0].val;
		return null;
	};

	P._exec = function () {
		var self = this,
			col = this.pb.collection(this.collection),
			base = { requestKey: null };
		try {
			if (this._op === 'select') {
				var filter = this._buildFilter();
				if (this._single) {
					return col
						.getFirstListItem(filter, base)
						.then(function (rec) {
							return { data: toAppRecord(rec), error: null };
						})
						.catch(function (e) {
							return { data: null, error: e };
						});
				}
				var lo = { requestKey: null };
				if (filter) lo.filter = filter;
				if (this._sort) lo.sort = toPbField(this._sort);
				return col
					.getFullList(lo)
					.then(function (recs) {
						return { data: recs.map(toAppRecord), error: null };
					})
					.catch(function (e) {
						return { data: null, error: e };
					});
			}
			if (this._op === 'insert') {
				return col
					.create(toPbPayload(this._payload), base)
					.then(function (rec) {
						return { data: self._single ? toAppRecord(rec) : [toAppRecord(rec)], error: null };
					})
					.catch(function (e) {
						return { data: null, error: e };
					});
			}
			if (this._op === 'update') {
				var payload = toPbPayload(this._payload);
				var id = this._idFilter();
				if (id != null) {
					return col
						.update(id, payload, base)
						.then(function (rec) {
							return { data: toAppRecord(rec), error: null };
						})
						.catch(function (e) {
							return { data: null, error: e };
						});
				}
				return col
					.getFullList({ filter: this._buildFilter(), requestKey: null })
					.then(function (recs) {
						return Promise.all(
							recs.map(function (r) {
								return col.update(r.id, payload, { requestKey: null });
							})
						);
					})
					.then(function () {
						return { data: null, error: null };
					})
					.catch(function (e) {
						return { data: null, error: e };
					});
			}
			if (this._op === 'delete') {
				var did = this._idFilter();
				if (did != null) {
					return col
						.delete(did, base)
						.then(function () {
							return { data: null, error: null };
						})
						.catch(function (e) {
							return { data: null, error: e };
						});
				}
				return col
					.getFullList({ filter: this._buildFilter(), requestKey: null })
					.then(function (recs) {
						return Promise.all(
							recs.map(function (r) {
								return col.delete(r.id, { requestKey: null });
							})
						);
					})
					.then(function () {
						return { data: null, error: null };
					})
					.catch(function (e) {
						return { data: null, error: e };
					});
			}
		} catch (e) {
			return Promise.resolve({ data: null, error: e });
		}
	};

	function createPBClient(url) {
		var pb = new PocketBase(url);
		pb.autoCancellation(false); // the app fires overlapping reads; don't auto-cancel them

		var authCb = null;
		function session() {
			var rec = pb.authStore.record || pb.authStore.model;
			if (!rec) return null;
			return {
				user: {
					id: rec.id,
					email: rec.email || rec.username || '',
					user_metadata: { full_name: rec.display_name || rec.name || rec.username || 'User' }
				}
			};
		}
		function fire() {
			if (authCb) authCb('CHANGE', session());
		}

		return {
			from: function (table) {
				return new PBQuery(pb, TABLE_MAP[table] || table);
			},
			auth: {
				onAuthStateChange: function (cb) {
					authCb = cb;
					pb.authStore.onChange(function () {
						fire();
					}, false);
					setTimeout(fire, 0); // fire once with the restored/current state
					return { data: { subscription: {} } };
				},
				signInWithPassword: function (identity, password) {
					return pb
						.collection('users')
						.authWithPassword(identity, password)
						.then(function () {
							return { error: null };
						})
						.catch(function (e) {
							return { error: e };
						});
				},
				signOut: function () {
					pb.authStore.clear();
					return Promise.resolve({ error: null });
				}
			},
			_pb: pb
		};
	}

	global.createPBClient = createPBClient;
})(window);

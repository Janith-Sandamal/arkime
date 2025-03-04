/******************************************************************************/
/*
 *
 * Copyright 2012-2016 AOL Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this Software except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const request = require('request');
const WISESource = require('./wiseSource.js');

class PassiveTotalSource extends WISESource {
  // ----------------------------------------------------------------------------
  constructor (api, section) {
    super(api, section, { });

    this.key = this.api.getConfig('passivetotal', 'key');
    this.user = this.api.getConfig('passivetotal', 'user');
    if (this.key === undefined) {
      console.log(this.section, '- No key defined');
      return;
    }
    this.api.addValueAction('passivetotal', { name: 'Passive Total Search', url: 'https://community.riskiq.com/search/%TEXT%/resolutions', category: 'md5,email,url,domain,ip' });
    if (this.user === undefined) {
      console.log(this.section, '- No user defined');
      return;
    }

    this.waiting = [];
    this.processing = {};

    this.api.addSource('passivetotal', this, ['domain', 'ip']);

    setInterval(this.performQuery.bind(this), 500);

    const str =
      'if (session.passivetotal)\n' +
      '  div.sessionDetailMeta.bold PassiveTotal\n' +
      '  dl.sessionDetailMeta\n' +
      "    +arrayList(session.passivetotal, 'tags', 'Tags', 'passivetotal.tags')\n";

    this.tagsField = this.api.addField('field:passivetotal.tags;db:passivetotal.tags;kind:termfield;friendly:Tags;help:PassiveTotal Tags;count:true');

    this.api.addView('passivetotal', str);
  }

  // ----------------------------------------------------------------------------
  performQuery = function () {
    if (this.waiting.length === 0) {
      return;
    }

    if (this.api.debug > 0) {
      console.log(this.section, '- Fetching %d', this.waiting.length);
    }

    const options = {
      url: 'https://api.passivetotal.org/v2/enrichment/bulk',
      body: {
        additional: ['osint', 'malware'],
        query: this.waiting
      },
      auth: {
        user: this.user,
        pass: this.key
      },
      method: 'GET',
      json: true
    };

    request(options, (err, im, results) => {
      if (err) {
        console.log(this.section, '- Error parsing for request:\n', options, '\nresults:\n', results);
        results = { results: {} };
      }

      for (const resultname in results.results) {
        const result = results.results[resultname];
        const cbs = this.processing[resultname];
        if (!cbs) {
          return;
        }
        delete this.processing[resultname];

        let wiseResult;
        if (result.tags === undefined || result.tags.length === 0) {
          wiseResult = WISESource.emptyResult;
        } else {
          const args = [];
          for (let i = 0; i < result.tags.length; i++) {
            if (typeof (result.tags[i]) === 'string') {
              args.push(this.tagsField, result.tags[i]);
            }
          }

          wiseResult = WISESource.encodeResult.apply(null, args);
        }

        let cb;
        while ((cb = cbs.shift())) {
          cb(null, wiseResult);
        }
      }
    }).on('error', (err) => {
      console.log(this.section, err);
    });

    this.waiting.length = 0;
  };

  // ----------------------------------------------------------------------------
  fetch (key, cb) {
    if (key in this.processing) {
      this.processing[key].push(cb);
      return;
    }

    this.processing[key] = [cb];
    this.waiting.push(key);
    if (this.waiting.length >= 25) {
      this.performQuery();
    }
  };

  // ----------------------------------------------------------------------------
  // eslint-disable-next-line no-use-before-define
  getIp = PassiveTotalSource.prototype.fetch;
  // eslint-disable-next-line no-use-before-define
  getDomain = PassiveTotalSource.prototype.fetch;
}

// ----------------------------------------------------------------------------
exports.initSource = function (api) {
  api.addSourceConfigDef('passivetotal', {
    singleton: true,
    name: 'passivetotal',
    description: 'Passive Total commercial support',
    types: ['ip', 'domain'],
    fields: [
      { name: 'key', password: true, required: true, help: 'The API key' },
      { name: 'user', required: true, help: 'The API user' }
    ]
  });

  return new PassiveTotalSource(api, 'passivetotal');
};
// ----------------------------------------------------------------------------

import { createCn } from 'cn/config'

/**
 * Class-name merging aware of the Kurio type scale. Without this extension the merger
 * reads `text-body-14` as a color and drops it next to `text-cream`.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display-43',
            'display-32',
            'heading-28',
            'heading-24',
            'title-22',
            'title-20',
            'body-18',
            'body-16',
            'body-15',
            'body-14',
            'caption-13',
            'caption-12',
            'tiny-11',
            'tiny-10',
            'tiny-9',
          ],
        },
      ],
    },
  },
})
